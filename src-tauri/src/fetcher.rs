use std::{
    collections::{HashMap, HashSet},
    time::Duration,
};

use kuchikiki::traits::*;

use reqwest::{
    header::{ACCEPT, CACHE_CONTROL, CONTENT_TYPE, REFERER, USER_AGENT},
    Client, Url,
};
use tauri::async_runtime::Mutex;

use crate::{
    config::SiteConfig,
    model::{
        BbsActionViewResult, BbsPostForm, BbsPostFormInput, ParsedReloadForm, SiteFetchResult,
    },
    parser::{
        decode_html, encode_post_form, encode_reload_form, parse_post_form, parse_posts,
        parse_reload_form,
    },
    reply_notification::SubmittedPostFields,
};

fn fxtwitter_status_endpoint(status_id: &str) -> Result<Url, String> {
    if status_id.is_empty() || !status_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("FxTwitterの投稿IDが不正です".to_string());
    }
    Url::parse(&format!("https://api.fxtwitter.com/2/status/{status_id}"))
        .map_err(|e| format!("FxTwitter API URLの生成に失敗しました: {e}"))
}

/// HTTPクライアントと、各サイトの「次回未読リロード用FORM」および
/// 「新規投稿FORMの参照元となる最新メインHTML」を保持する。
///
/// 初回GETでFORMを取得し、その後はPOSTレスポンスに含まれるFORMへ毎回更新することで、
/// 90秒ごとの更新時に余計なGETを挟まない。
pub struct ReaderState {
    client: Client,
    reload_forms: Mutex<HashMap<String, ParsedReloadForm>>,
    post_forms: Mutex<HashMap<String, BbsPostForm>>,
    main_html_cache: Mutex<HashMap<String, CachedBbsHtml>>,
    known_post_ids: Mutex<HashMap<String, HashSet<String>>>,
}

#[derive(Debug, Clone)]
struct CachedBbsHtml {
    source_url: Url,
    html: String,
}

#[derive(Debug, Clone)]
pub struct SubmissionTrackingContext {
    pub submitted: SubmittedPostFields,
    pub known_before: HashSet<String>,
}

impl ReaderState {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| format!("HTTPクライアントの初期化に失敗しました: {e}"))?;

        Ok(Self {
            client,
            reload_forms: Mutex::new(HashMap::new()),
            post_forms: Mutex::new(HashMap::new()),
            main_html_cache: Mutex::new(HashMap::new()),
            known_post_ids: Mutex::new(HashMap::new()),
        })
    }

    pub async fn fetch_fxtwitter_status(
        &self,
        status_id: &str,
    ) -> Result<serde_json::Value, String> {
        let endpoint = fxtwitter_status_endpoint(status_id)?;
        let response = self
            .client
            .get(endpoint)
            .header(USER_AGENT, "Midoku Bosatsu FxTwitter Preview")
            .header(ACCEPT, "application/json")
            .send()
            .await
            .map_err(|e| format!("FxTwitter APIの取得に失敗しました: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "FxTwitter APIがHTTPエラーを返しました: {} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }
        let body = response
            .bytes()
            .await
            .map_err(|e| format!("FxTwitter APIのレスポンス読み込みに失敗しました: {e}"))?;
        serde_json::from_slice(&body)
            .map_err(|e| format!("FxTwitter APIのレスポンス解析に失敗しました: {e}"))
    }

    pub async fn clear_reload_forms(&self) {
        self.reload_forms.lock().await.clear();
        self.post_forms.lock().await.clear();
        self.main_html_cache.lock().await.clear();
        self.known_post_ids.lock().await.clear();
    }

    async fn record_known_posts(&self, site_id: &str, posts: &[crate::model::ParsedPost]) {
        let mut known = self.known_post_ids.lock().await;
        let site_known = known.entry(site_id.to_string()).or_default();
        site_known.extend(
            posts
                .iter()
                .map(|post| post.id.clone())
                .filter(|id| !id.is_empty()),
        );
    }

    pub async fn submission_tracking_context(
        &self,
        site: &SiteConfig,
        source_url: &str,
        purpose: &str,
        inputs: &[BbsPostFormInput],
    ) -> Result<SubmissionTrackingContext, String> {
        let referer = resolve_same_origin_bbs_link(site, source_url)?;
        let cache_key = post_form_cache_key(&site.id, referer.as_str(), purpose);
        let form = {
            let forms = self.post_forms.lock().await;
            forms.get(&cache_key).cloned().ok_or_else(|| {
                format!(
                    "{} の投稿FORMが見つかりません。投稿画面を開き直してください",
                    site.name
                )
            })?
        };

        let values: HashMap<&str, &BbsPostFormInput> = inputs
            .iter()
            .map(|input| (input.id.as_str(), input))
            .collect();
        let mut submitted = SubmittedPostFields::default();
        for control in &form.controls {
            let Some(user_field) = control.user_field.as_deref() else {
                continue;
            };
            let value = values
                .get(control.id.as_str())
                .map(|input| input.value.clone())
                .unwrap_or_default();
            match user_field {
                "author" => submitted.author = value,
                "email" => submitted.email = value,
                "subject" => submitted.subject = value,
                "body" => submitted.body = value,
                "url" => submitted.url = value,
                _ => {}
            }
        }

        let known_before = self
            .known_post_ids
            .lock()
            .await
            .get(&site.id)
            .cloned()
            .unwrap_or_default();
        Ok(SubmissionTrackingContext {
            submitted,
            known_before,
        })
    }

    /// アプリ起動時の通常GET。
    pub async fn fetch_initial(&self, site: &SiteConfig) -> Result<SiteFetchResult, String> {
        let response = self
            .client
            .get(site.fetch.url.as_str())
            .header(USER_AGENT, site.user_agent.as_str())
            .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            .header(CACHE_CONTROL, "no-cache")
            .send()
            .await
            .map_err(|e| format!("{} のGETに失敗しました: {e}", site.name))?;

        self.parse_response(site, "GET", response).await
    }

    /// 直前のレスポンスから保存したFORMを使って未読リロードPOSTを送る。
    pub async fn reload_unread(&self, site: &SiteConfig) -> Result<SiteFetchResult, String> {
        let form = {
            let forms = self.reload_forms.lock().await;
            forms.get(&site.id).cloned().ok_or_else(|| {
                format!(
                    "{} の未読リロードFORMがまだありません。先に初回GETを実行してください",
                    site.name
                )
            })?
        };

        if !form.method.eq_ignore_ascii_case("POST") {
            return Err(format!(
                "{} の未読リロードmethodがPOSTではありません: {}",
                site.name, form.method
            ));
        }

        let post_url = resolve_form_action(site, form.action.as_deref())?;
        let body = encode_reload_form(&form, &site.encoding)?;

        let response = self
            .client
            .post(post_url)
            .header(USER_AGENT, site.user_agent.as_str())
            .header(REFERER, form.referer.as_str())
            .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            .header(CACHE_CONTROL, "no-cache")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("{} の未読リロードPOSTに失敗しました: {e}", site.name))?;

        self.parse_response(site, "POST", response).await
    }

    /// 投稿日時横の「■ / ◆」から取得するページを、未読菩薩内表示用にGETする。
    /// 掲示板が返したリンクだけを使い、取得先BBSと同一origin以外にはアクセスしない。
    pub async fn fetch_action_view(
        &self,
        site: &SiteConfig,
        href: &str,
    ) -> Result<BbsActionViewResult, String> {
        let target = resolve_same_origin_bbs_link(site, href)?;

        let response = self
            .client
            .get(target.clone())
            .header(USER_AGENT, site.user_agent.as_str())
            .header(REFERER, site.fetch.url.as_str())
            .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            .header(CACHE_CONTROL, "no-cache")
            .send()
            .await
            .map_err(|e| format!("{} のリンク先取得に失敗しました: {e}", site.name))?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "{} のリンク先がHTTPエラーを返しました: {} {}",
                site.name,
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }

        let response_url = response.url().clone();
        ensure_same_origin(site, &response_url)?;
        let bytes = response.bytes().await.map_err(|e| {
            format!(
                "{} のリンク先レスポンス読み込みに失敗しました: {e}",
                site.name
            )
        })?;
        let html = decode_html(&bytes, &site.encoding)?;

        self.build_action_view_result(site, response_url, &html, true)
            .await
    }

    /// `■` のフォロー投稿画面から抽出・保持したFORMへPOSTする。
    /// action / hidden / submit値はRust側で保持した元FORMを使用し、
    /// フロントエンドからは編集可能controlの値だけを受け取る。
    pub async fn submit_follow_post(
        &self,
        site: &SiteConfig,
        source_url: &str,
        inputs: Vec<BbsPostFormInput>,
    ) -> Result<BbsActionViewResult, String> {
        let referer = resolve_same_origin_bbs_link(site, source_url)?;
        let cache_key = post_form_cache_key(&site.id, referer.as_str(), "follow");
        let form = {
            let forms = self.post_forms.lock().await;
            forms.get(&cache_key).cloned().ok_or_else(|| {
                format!(
                    "{} のフォロー投稿FORMが見つかりません。■の画面を開き直してください",
                    site.name
                )
            })?
        };

        if !form.method.eq_ignore_ascii_case("POST") {
            return Err(format!(
                "{} の投稿FORM methodがPOSTではありません: {}",
                site.name, form.method
            ));
        }

        let post_url = resolve_same_origin_form_action(site, &referer, form.action.as_deref())?;
        let body = encode_post_form(&form, &inputs, &site.encoding)?;

        let response = self
            .client
            .post(post_url)
            .header(USER_AGENT, site.user_agent.as_str())
            .header(REFERER, referer.as_str())
            .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            .header(CACHE_CONTROL, "no-cache")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("{} のフォロー投稿POSTに失敗しました: {e}", site.name))?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "{} のフォロー投稿先がHTTPエラーを返しました: {} {}",
                site.name,
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }

        let response_url = response.url().clone();
        ensure_same_origin(site, &response_url)?;
        let bytes = response.bytes().await.map_err(|e| {
            format!(
                "{} のフォロー投稿レスポンス読み込みに失敗しました: {e}",
                site.name
            )
        })?;
        let html = decode_html(&bytes, &site.encoding)?;

        // 投稿後に通常掲示板画面が返った場合は、次回未読リロード用FORMも更新する。
        if let Ok(reload_form) = parse_reload_form(&html, site) {
            self.reload_forms
                .lock()
                .await
                .insert(site.id.clone(), reload_form);
        }

        self.build_action_view_result(site, response_url, &html, true)
            .await
    }

    /// 最新のメインHTMLキャッシュから、新規投稿用FORMを取得する。
    pub async fn fetch_new_post_form(
        &self,
        site: &SiteConfig,
    ) -> Result<BbsActionViewResult, String> {
        let cached = {
            let cache = self.main_html_cache.lock().await;
            cache
                .get(&site.id)
                .cloned()
                .ok_or_else(|| cached_new_post_form_error(site).unwrap_err())?
        };

        self.build_action_view_result(site, cached.source_url, &cached.html, false)
            .await
    }

    /// 通常ページから取得・保持した新規投稿FORMへPOSTする。
    pub async fn submit_new_post(
        &self,
        site: &SiteConfig,
        source_url: &str,
        inputs: Vec<BbsPostFormInput>,
    ) -> Result<BbsActionViewResult, String> {
        let referer = resolve_same_origin_bbs_link(site, source_url)?;
        let cache_key = post_form_cache_key(&site.id, referer.as_str(), "new");
        let form = {
            let forms = self.post_forms.lock().await;
            forms.get(&cache_key).cloned().ok_or_else(|| {
                format!(
                    "{} の新規投稿FORMが見つかりません。投稿先を選び直してください",
                    site.name
                )
            })?
        };

        if !form.method.eq_ignore_ascii_case("POST") {
            return Err(format!(
                "{} の新規投稿FORM methodがPOSTではありません: {}",
                site.name, form.method
            ));
        }

        let post_url = resolve_same_origin_form_action(site, &referer, form.action.as_deref())?;
        let body = encode_post_form(&form, &inputs, &site.encoding)?;

        let response = self
            .client
            .post(post_url)
            .header(USER_AGENT, site.user_agent.as_str())
            .header(REFERER, referer.as_str())
            .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
            .header(CACHE_CONTROL, "no-cache")
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("{} の新規投稿POSTに失敗しました: {e}", site.name))?;

        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "{} の新規投稿先がHTTPエラーを返しました: {} {}",
                site.name,
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }

        let response_url = response.url().clone();
        ensure_same_origin(site, &response_url)?;
        let bytes = response.bytes().await.map_err(|e| {
            format!(
                "{} の新規投稿レスポンス読み込みに失敗しました: {e}",
                site.name
            )
        })?;
        let html = decode_html(&bytes, &site.encoding)?;

        if let Ok(reload_form) = parse_reload_form(&html, site) {
            self.reload_forms
                .lock()
                .await
                .insert(site.id.clone(), reload_form);
        }

        self.build_action_view_result(site, response_url, &html, false)
            .await
    }

    async fn build_action_view_result(
        &self,
        site: &SiteConfig,
        source_url: Url,
        html: &str,
        follow_only: bool,
    ) -> Result<BbsActionViewResult, String> {
        let posts = parse_posts(html, site)?;
        self.record_known_posts(&site.id, &posts).await;
        let message = extract_action_view_message(html);
        let error_message = extract_action_view_error_message(html);
        let post_form = parse_post_form(html, source_url.as_str())?
            .filter(|form| !follow_only || is_follow_post_form(&source_url, form));

        let purpose = if follow_only { "follow" } else { "new" };
        let cache_key = post_form_cache_key(&site.id, source_url.as_str(), purpose);
        {
            let mut forms = self.post_forms.lock().await;
            if let Some(form) = post_form.as_ref() {
                forms.insert(cache_key, form.clone());
            } else {
                forms.remove(&cache_key);
            }
        }

        Ok(BbsActionViewResult {
            site_id: site.id.clone(),
            site_name: site.name.clone(),
            source_url: source_url.to_string(),
            posts,
            message,
            error_message,
            post_form,
            tracking_error: String::new(),
        })
    }

    async fn parse_response(
        &self,
        site: &SiteConfig,
        request_method: &str,
        response: reqwest::Response,
    ) -> Result<SiteFetchResult, String> {
        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "{} がHTTPエラーを返しました: {} {}",
                site.name,
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }

        let response_url = response.url().clone();
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("{} のレスポンス読み込みに失敗しました: {e}", site.name))?;

        let html = decode_html(&bytes, &site.encoding)?;
        self.main_html_cache.lock().await.insert(
            site.id.clone(),
            CachedBbsHtml {
                source_url: response_url.clone(),
                html: html.clone(),
            },
        );
        let posts = parse_posts(&html, site)?;
        self.record_known_posts(&site.id, &posts).await;
        let reload_form = parse_reload_form(&html, site)?;

        {
            let mut forms = self.reload_forms.lock().await;
            forms.insert(site.id.clone(), reload_form);
        }

        Ok(SiteFetchResult {
            site_id: site.id.clone(),
            site_name: site.name.clone(),
            request_method: request_method.to_owned(),
            fetched_at: chrono::Utc::now().to_rfc3339(),
            posts,
            reply_detected: false,
            reply_post_ids: Vec::new(),
            reply_notification_error: String::new(),
        })
    }
}

fn resolve_same_origin_bbs_link(site: &SiteConfig, href: &str) -> Result<Url, String> {
    let base = Url::parse(&site.fetch.url)
        .map_err(|e| format!("取得先URLが不正です ({}): {e}", site.fetch.url))?;
    let target = base
        .join(href.trim())
        .map_err(|e| format!("掲示板リンクのURL解決に失敗しました ({href}): {e}"))?;

    if !matches!(target.scheme(), "http" | "https") {
        return Err(format!(
            "HTTP(S)以外の掲示板リンクは開けません: {}",
            target.scheme()
        ));
    }
    if target.origin() != base.origin() {
        return Err("取得先BBSと異なるサイトのリンクは未読菩薩内では開けません".to_string());
    }

    Ok(target)
}

fn extract_action_view_message(html: &str) -> String {
    let document = kuchikiki::parse_html().one(html).document_node;
    for selector in ["h3", "h2", "h1"] {
        if let Ok(mut matches) = document.select(selector) {
            if let Some(node) = matches.next() {
                let text = node.text_contents().trim().to_owned();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }
    String::new()
}

/// フォロー投稿後のHTMLに、投稿失敗を示すメッセージが含まれるかを調べる。
///
/// 掲示板本文そのものには「エラー」「失敗」などの語が普通に投稿され得るため、
/// HTML全体の単純な文字列検索は行わない。明示的なエラー要素と、
/// CGIの結果メッセージとして使われやすい見出しだけを対象にする。
fn extract_action_view_error_message(html: &str) -> String {
    let document = kuchikiki::parse_html().one(html).document_node;

    // class/id/roleで明示的にエラーと示されている要素は、その内容をそのまま採用する。
    for selector in [".error", ".err", "#error", "#err", "[role=\"alert\"]"] {
        if let Ok(matches) = document.select(selector) {
            for node in matches {
                let text = node.text_contents().trim().to_owned();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }

    // 旧来CGIではエラー文を見出しで返すことが多い。
    for selector in ["h1", "h2", "h3", "h4", "title"] {
        if let Ok(matches) = document.select(selector) {
            for node in matches {
                let text = node.text_contents().trim().to_owned();
                if looks_like_action_error_message(&text) {
                    return text;
                }
            }
        }
    }

    // 古いHTMLでよくある赤字のエラー表示も拾う。
    if let Ok(matches) = document.select("font[color]") {
        for node in matches {
            let attrs = node.attributes.borrow();
            let color = attrs.get("color").unwrap_or("").trim().to_ascii_lowercase();
            if !matches!(color.as_str(), "red" | "#f00" | "#ff0000") {
                continue;
            }
            let text = node.text_contents().trim().to_owned();
            if !text.is_empty() && looks_like_action_error_message(&text) {
                return text;
            }
        }
    }

    String::new()
}

fn looks_like_action_error_message(text: &str) -> bool {
    let normalized = text.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }

    [
        "エラー",
        "error",
        "失敗",
        "できません",
        "出来ません",
        "書き込めません",
        "投稿できません",
        "見つかりません",
        "存在しません",
        "ありません",
        "不正",
        "拒否",
        "入力してください",
        "入力して下さい",
        "必須",
        "長すぎ",
        "短すぎ",
        "連続投稿",
        "規制されています",
        "禁止されています",
        "ngワード",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

fn is_follow_post_form(source_url: &Url, form: &BbsPostForm) -> bool {
    let query_marks_follow = source_url.query_pairs().any(|(name, value)| {
        (name.eq_ignore_ascii_case("m") && value.eq_ignore_ascii_case("f"))
            || (name.eq_ignore_ascii_case("mode") && value.eq_ignore_ascii_case("follow"))
    });
    let hidden_marks_follow = form
        .controls
        .iter()
        .any(|control| control.name.eq_ignore_ascii_case("f") && !control.value.trim().is_empty());
    query_marks_follow || hidden_marks_follow
}

fn post_form_cache_key(site_id: &str, source_url: &str, purpose: &str) -> String {
    format!("{purpose}\n{site_id}\n{source_url}")
}

fn parse_new_post_form_from_cached_html(
    site: &SiteConfig,
    cached: Option<&CachedBbsHtml>,
) -> Result<Option<BbsPostForm>, String> {
    let cached = cached.ok_or_else(|| {
        format!(
            "{} の新規投稿FORM用HTMLキャッシュがありません。先に初回取得または未読リロードを実行してください",
            site.name
        )
    })?;
    parse_post_form(&cached.html, cached.source_url.as_str())
        .map(|form| form.filter(|form| !is_follow_post_form(&cached.source_url, form)))
}

fn cached_new_post_form_error(site: &SiteConfig) -> Result<Option<BbsPostForm>, String> {
    parse_new_post_form_from_cached_html(site, None)
}

fn ensure_same_origin(site: &SiteConfig, target: &Url) -> Result<(), String> {
    let base = Url::parse(&site.fetch.url)
        .map_err(|e| format!("取得先URLが不正です ({}): {e}", site.fetch.url))?;
    if target.origin() != base.origin() {
        return Err("取得先BBSと異なるサイトへは未読菩薩内から送信できません".to_string());
    }
    Ok(())
}

fn resolve_same_origin_form_action(
    site: &SiteConfig,
    referer: &Url,
    action: Option<&str>,
) -> Result<Url, String> {
    ensure_same_origin(site, referer)?;
    let target = match action.map(str::trim).filter(|value| !value.is_empty()) {
        Some(action) => referer
            .join(action)
            .map_err(|e| format!("投稿FORM action のURL解決に失敗しました ({action}): {e}"))?,
        None => referer.clone(),
    };
    if !matches!(target.scheme(), "http" | "https") {
        return Err(format!(
            "HTTP(S)以外の投稿先には送信できません: {}",
            target.scheme()
        ));
    }
    ensure_same_origin(site, &target)?;
    Ok(target)
}

fn resolve_form_action(site: &SiteConfig, action: Option<&str>) -> Result<Url, String> {
    let base = Url::parse(&site.fetch.url)
        .map_err(|e| format!("取得先URLが不正です ({}): {e}", site.fetch.url))?;

    let Some(action) = action.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(base);
    };

    base.join(action)
        .map_err(|e| format!("FORM action のURL解決に失敗しました ({action}): {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{FetchConfig, PostParserConfig, ReloadFormConfig};

    fn site(url: &str) -> SiteConfig {
        SiteConfig {
            id: "test".into(),
            name: "test".into(),
            enabled: true,
            encoding: "shift_jis".into(),
            user_agent: "test".into(),
            timezone_offset_minutes: 540,
            timezone_region: "東京".to_string(),
            badge_style: Default::default(),
            fetch: FetchConfig { url: url.into() },
            post_parser: PostParserConfig {
                mode: "legacy_anchor_siblings".into(),
                anchor_selector: "a[name]".into(),
                id_attribute: "name".into(),
                header_tag: "font".into(),
                name_tag: "b".into(),
                info_tag: "font".into(),
                body_container_tag: "blockquote".into(),
                body_tag: "pre".into(),
                date_prefix: "投稿日：".into(),
                timestamp_regex: String::new(),
                ..Default::default()
            },
            reload_form: ReloadFormConfig {
                form_selector: "form".into(),
                submit_input_name: "midokureload".into(),
                submit_input_name_fallbacks: vec![],
                submit_value_regex: String::new(),
                method: "POST".into(),
                referer: url.into(),
                include_hidden: true,
            },
        }
    }

    #[test]
    fn new_and_follow_post_forms_use_separate_cache_keys() {
        let source = "https://example.com/cgi-bin/bbs.cgi";
        assert_ne!(
            post_form_cache_key("test", source, "new"),
            post_form_cache_key("test", source, "follow")
        );
    }

    #[test]
    fn fxtwitter_status_endpoint_accepts_only_numeric_status_ids() {
        assert_eq!(
            fxtwitter_status_endpoint("123456789").unwrap().as_str(),
            "https://api.fxtwitter.com/2/status/123456789"
        );
        assert!(fxtwitter_status_endpoint("https://example.com/").is_err());
        assert!(fxtwitter_status_endpoint("123/../../private").is_err());
    }

    #[test]
    fn new_post_form_is_parsed_from_cached_main_html() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let cached = CachedBbsHtml {
            source_url: Url::parse(site.fetch.url.as_str()).unwrap(),
            html: r#"
              <form method="post" action="/cgi-bin/bbs.cgi">
                <input type="hidden" name="m" value="p">
                <input type="text" name="u" value="名無し">
                <textarea name="v"></textarea>
                <input type="submit" name="post" value="投稿">
              </form>
            "#
            .to_string(),
        };

        let form = parse_new_post_form_from_cached_html(&site, Some(&cached))
            .unwrap()
            .expect("cached HTML should contain the new-post form");
        assert_eq!(form.source_url, site.fetch.url);
        assert_eq!(form.method, "POST");
        assert_eq!(form.action.as_deref(), Some("/cgi-bin/bbs.cgi"));
    }

    #[test]
    fn missing_cached_main_html_returns_an_actionable_error() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let error = parse_new_post_form_from_cached_html(&site, None).unwrap_err();
        assert!(error.contains("先に初回取得または未読リロードを実行してください"));
    }

    #[test]
    fn normal_post_form_does_not_require_follow_marker() {
        let html = r#"
          <form method="post" action="/cgi-bin/bbs.cgi">
            <input type="hidden" name="m" value="p">
            <input type="text" name="u" value="名無し">
            <textarea name="v"></textarea>
            <input type="submit" name="post" value="投稿">
          </form>
        "#;
        let source_url = Url::parse("https://example.com/cgi-bin/bbs.cgi").unwrap();
        let form = parse_post_form(html, source_url.as_str()).unwrap().unwrap();
        assert!(!is_follow_post_form(&source_url, &form));
    }

    #[test]
    fn resolves_relative_form_action() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let url = resolve_form_action(&site, Some("bbs.cgi?m=r")).unwrap();
        assert_eq!(url.as_str(), "https://example.com/cgi-bin/bbs.cgi?m=r");
    }

    #[test]
    fn empty_form_action_uses_fetch_url() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let url = resolve_form_action(&site, Some("")).unwrap();
        assert_eq!(url.as_str(), "https://example.com/cgi-bin/bbs.cgi");
    }

    #[test]
    fn resolves_same_origin_action_link() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let url = resolve_same_origin_bbs_link(&site, "?m=t&s=123").unwrap();
        assert_eq!(
            url.as_str(),
            "https://example.com/cgi-bin/bbs.cgi?m=t&s=123"
        );
    }

    #[test]
    fn rejects_cross_origin_action_link() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        assert!(resolve_same_origin_bbs_link(&site, "https://evil.example/bbs.cgi").is_err());
    }

    #[test]
    fn resolves_follow_form_action_from_actual_referer() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let referer = Url::parse("https://example.com/cgi-bin/bbs.cgi?m=f&s=123").unwrap();
        let url = resolve_same_origin_form_action(&site, &referer, Some("bbs.cgi")).unwrap();
        assert_eq!(url.as_str(), "https://example.com/cgi-bin/bbs.cgi");
    }

    #[test]
    fn rejects_cross_origin_follow_form_action() {
        let site = site("https://example.com/cgi-bin/bbs.cgi");
        let referer = Url::parse("https://example.com/cgi-bin/bbs.cgi?m=f&s=123").unwrap();
        assert!(resolve_same_origin_form_action(
            &site,
            &referer,
            Some("https://evil.example/post")
        )
        .is_err());
    }

    #[test]
    fn detects_heading_error_message_after_follow_post() {
        let html = r#"
          <html><body>
            <h3>指定されたメッセージが見つかりません。</h3>
          </body></html>
        "#;
        assert_eq!(
            extract_action_view_error_message(html),
            "指定されたメッセージが見つかりません。"
        );
    }

    #[test]
    fn detects_explicit_error_element_after_follow_post() {
        let html = r#"
          <html><body>
            <div class="error">本文を入力してください。</div>
          </body></html>
        "#;
        assert_eq!(
            extract_action_view_error_message(html),
            "本文を入力してください。"
        );
    }

    #[test]
    fn normal_board_post_containing_error_word_is_not_submission_error() {
        let html = r#"
          <html><body>
            <blockquote><pre>さっきエラーが出た(;´Д`)</pre></blockquote>
          </body></html>
        "#;
        assert!(extract_action_view_error_message(html).is_empty());
    }
}
