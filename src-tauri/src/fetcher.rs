use std::{
    collections::{HashMap, HashSet},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs},
    sync::OnceLock,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use kuchikiki::traits::*;

use reqwest::{
    header::{ACCEPT, CACHE_CONTROL, CONTENT_TYPE, LOCATION, REFERER, USER_AGENT},
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

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct TwitterCardPreview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub image_url: String,
    pub site_name: String,
}

const TWITTER_CARD_HTML_LIMIT_BYTES: usize = 1024 * 1024;
const TWITTER_CARD_IMAGE_LIMIT_BYTES: usize = 1024 * 1024;
const TWITTER_CARD_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

fn is_public_preview_ipv4(address: Ipv4Addr) -> bool {
    let [a, b, c, _] = address.octets();
    !(address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_multicast()
        || address.is_broadcast()
        || address.is_documentation()
        || address.is_unspecified()
        || a == 0
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 88 && c == 99)
        || (a == 198 && (b == 18 || b == 19))
        || a >= 240)
}

fn is_public_preview_ipv6(address: Ipv6Addr) -> bool {
    if let Some(ipv4) = address.to_ipv4_mapped() {
        return is_public_preview_ipv4(ipv4);
    }
    let segments = address.segments();
    (0x2000..=0x3fff).contains(&segments[0])
        && !(segments[0] == 0x2001 && matches!(segments[1], 0x0002 | 0x0010 | 0x0db8))
        && segments[0] != 0x2002
}

fn is_public_preview_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_preview_ipv4(address),
        IpAddr::V6(address) => is_public_preview_ipv6(address),
    }
}

fn is_excluded_preview_host(host: &str) -> bool {
    const EXCLUDED: [&str; 5] = [
        "x.com",
        "twitter.com",
        "youtube.com",
        "youtube-nocookie.com",
        "youtu.be",
    ];
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    normalized == "localhost"
        || normalized.ends_with(".localhost")
        || EXCLUDED
            .iter()
            .any(|domain| normalized == *domain || normalized.ends_with(&format!(".{domain}")))
}

fn has_excluded_media_extension(path: &str) -> bool {
    let Some(extension) = path
        .rsplit('/')
        .next()
        .and_then(|name| name.rsplit_once('.'))
    else {
        return false;
    };
    matches!(
        extension.1.to_ascii_lowercase().as_str(),
        "3g2"
            | "3gp"
            | "apng"
            | "avif"
            | "avi"
            | "bmp"
            | "flv"
            | "gif"
            | "heic"
            | "heif"
            | "ico"
            | "jfif"
            | "jpg"
            | "jpeg"
            | "m2ts"
            | "m4v"
            | "mkv"
            | "mov"
            | "mp4"
            | "mpeg"
            | "mpg"
            | "ogv"
            | "png"
            | "svg"
            | "tif"
            | "tiff"
            | "ts"
            | "webm"
            | "webp"
            | "wmv"
    )
}

fn twitter_card_page_url(raw_url: &str) -> Result<Url, String> {
    let mut url = Url::parse(raw_url).map_err(|e| format!("Twitter Card URLが不正です: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Twitter Card URLはHTTP(S)で指定してください".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("認証情報を含むTwitter Card URLは取得できません".to_string());
    }
    let Some(host) = url.host_str() else {
        return Err("Twitter Card URLにホスト名がありません".to_string());
    };
    let normalized_host = host.trim_end_matches('.').to_string();
    if is_excluded_preview_host(&normalized_host) || has_excluded_media_extension(url.path()) {
        return Err("Twitter Cardプレビューの対象外URLです".to_string());
    }
    if normalized_host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
        .is_ok_and(|address| !is_public_preview_ip(address))
    {
        return Err("公開インターネット以外のURLは取得できません".to_string());
    }
    if normalized_host != host {
        url.set_host(Some(&normalized_host))
            .map_err(|_| "Twitter Card URLのホスト名が不正です".to_string())?;
    }
    Ok(url)
}

fn twitter_card_resource_url(raw_url: &str) -> Result<Url, String> {
    let mut url = Url::parse(raw_url).map_err(|e| format!("Twitter Card画像URLが不正です: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Twitter Card画像URLはHTTP(S)で指定してください".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("認証情報を含むTwitter Card画像URLは取得できません".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Twitter Card画像URLにホスト名がありません".to_string())?;
    let normalized_host = host.trim_end_matches('.').to_string();
    if is_excluded_preview_host(&normalized_host) {
        return Err("Twitter Card画像の取得対象外URLです".to_string());
    }
    if normalized_host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
        .is_ok_and(|address| !is_public_preview_ip(address))
    {
        return Err("公開インターネット以外の画像URLは取得できません".to_string());
    }
    if normalized_host != host {
        url.set_host(Some(&normalized_host))
            .map_err(|_| "Twitter Card画像URLのホスト名が不正です".to_string())?;
    }
    Ok(url)
}

async fn resolve_public_preview_addresses(url: &Url) -> Result<(String, Vec<SocketAddr>), String> {
    let host = url
        .host_str()
        .ok_or_else(|| "Twitter Card URLにホスト名がありません".to_string())?
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Twitter Card URLのポートが不正です".to_string())?;
    let lookup_host = host.clone();
    let addresses = tauri::async_runtime::spawn_blocking(move || {
        (lookup_host.as_str(), port)
            .to_socket_addrs()
            .map(|addresses| addresses.collect::<Vec<_>>())
    })
    .await
    .map_err(|e| format!("Twitter Card URLの名前解決に失敗しました: {e}"))?
    .map_err(|e| format!("Twitter Card URLの名前解決に失敗しました: {e}"))?;

    if addresses.is_empty()
        || addresses
            .iter()
            .any(|address| !is_public_preview_ip(address.ip()))
    {
        return Err("公開インターネット以外のURLは取得できません".to_string());
    }
    Ok((host, addresses))
}

async fn fetch_protected_preview_response(
    initial_url: Url,
    accept: &str,
    validate_redirect: fn(&str) -> Result<Url, String>,
) -> Result<(Url, reqwest::Response), String> {
    const MAX_REDIRECTS: usize = 10;
    let mut current_url = initial_url;

    for redirect_count in 0..=MAX_REDIRECTS {
        let (host, addresses) = resolve_public_preview_addresses(&current_url).await?;
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(TWITTER_CARD_REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .resolve_to_addrs(&host, &addresses)
            .build()
            .map_err(|e| format!("Twitter Card HTTPクライアントの初期化に失敗しました: {e}"))?;
        let response = client
            .get(current_url.clone())
            .header(USER_AGENT, "Midoku Bosatsu Twitter Card Preview")
            .header(ACCEPT, accept)
            .send()
            .await
            .map_err(|e| format!("Twitter Cardリソースの取得に失敗しました: {e}"))?;

        if !response.status().is_redirection() {
            return Ok((current_url, response));
        }
        if redirect_count == MAX_REDIRECTS {
            return Err("Twitter Cardリソースのリダイレクト回数が上限を超えました".to_string());
        }
        let location = response
            .headers()
            .get(LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| "Twitter Cardリソースのリダイレクト先が不正です".to_string())?;
        let redirect_url = current_url
            .join(location)
            .map_err(|e| format!("Twitter Cardリソースのリダイレクト先が不正です: {e}"))?;
        current_url = validate_redirect(redirect_url.as_str())?;
    }

    Err("Twitter Cardリソースを取得できませんでした".to_string())
}

async fn read_limited_response(
    response: &mut reqwest::Response,
    limit: usize,
) -> Result<Option<Vec<u8>>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Ok(None);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Twitter Cardリソースの読み込みに失敗しました: {e}"))?
    {
        if body.len() + chunk.len() > limit {
            return Ok(None);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(Some(body))
}

fn twitter_card_content_type_is_html(content_type: &str) -> bool {
    matches!(
        content_type.split(';').next().map(str::trim),
        Some("text/html" | "application/xhtml+xml")
    )
}

fn decode_twitter_card_html(body: &[u8], content_type: &str) -> String {
    let charset = content_type.split(';').skip(1).find_map(|parameter| {
        let (name, value) = parameter.trim().split_once('=')?;
        name.eq_ignore_ascii_case("charset")
            .then(|| value.trim().trim_matches(['"', '\'']))
    });
    let encoding = charset
        .and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8);
    encoding.decode(body).0.into_owned()
}

fn twitter_card_image_data_url(content_type: &str, body: &[u8]) -> Option<String> {
    let mime = content_type.split(';').next()?.trim().to_ascii_lowercase();
    if !matches!(
        mime.as_str(),
        "image/avif" | "image/bmp" | "image/gif" | "image/jpeg" | "image/png" | "image/webp"
    ) {
        return None;
    }
    Some(format!(
        "data:{mime};base64,{}",
        BASE64_STANDARD.encode(body)
    ))
}

fn extract_twitter_card_preview(html: &str, page_url: &Url) -> Option<TwitterCardPreview> {
    let document = kuchikiki::parse_html().one(html).document_node;
    let mut metadata = HashMap::<String, String>::new();

    if let Ok(elements) = document.select("meta") {
        for element in elements {
            let attributes = element.attributes.borrow();
            let key = attributes
                .get("name")
                .or_else(|| attributes.get("property"))
                .map(str::trim)
                .filter(|key| !key.is_empty())
                .map(str::to_ascii_lowercase);
            let content = attributes
                .get("content")
                .map(str::trim)
                .filter(|content| !content.is_empty());
            if let (Some(key), Some(content)) = (key, content) {
                metadata.entry(key).or_insert_with(|| content.to_string());
            }
        }
    }

    let html_title = document
        .select_first("title")
        .ok()
        .map(|element| element.text_contents().trim().to_string())
        .filter(|title| !title.is_empty());
    let title = metadata
        .get("twitter:title")
        .or_else(|| metadata.get("og:title"))
        .cloned()
        .or(html_title)
        .unwrap_or_default();
    let description = metadata
        .get("twitter:description")
        .or_else(|| metadata.get("og:description"))
        .or_else(|| metadata.get("description"))
        .cloned()
        .unwrap_or_default();
    let image_url = metadata
        .get("twitter:image")
        .or_else(|| metadata.get("twitter:image:src"))
        .or_else(|| metadata.get("og:image"))
        .and_then(|value| page_url.join(value).ok())
        .filter(|url| matches!(url.scheme(), "http" | "https"))
        .map(|url| url.to_string())
        .unwrap_or_default();

    if title.is_empty() && description.is_empty() && image_url.is_empty() {
        return None;
    }

    let site_name = metadata
        .get("og:site_name")
        .cloned()
        .or_else(|| page_url.host_str().map(ToOwned::to_owned))
        .unwrap_or_default();

    Some(TwitterCardPreview {
        url: page_url.to_string(),
        title,
        description,
        image_url,
        site_name,
    })
}

fn fxtwitter_status_endpoint(
    status_id: &str,
    target_language: Option<&str>,
) -> Result<Url, String> {
    if status_id.is_empty() || !status_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("FxTwitterの投稿IDが不正です".to_string());
    }
    let translation_language = match target_language {
        Some(language)
            if language.len() == 2 && language.bytes().all(|byte| byte.is_ascii_alphabetic()) =>
        {
            Some(language.to_ascii_lowercase())
        }
        Some(_) => return Err("FxTwitterの翻訳先言語が不正です".to_string()),
        None => None,
    };
    let mut endpoint = Url::parse(&format!("https://api.fxtwitter.com/2/status/{status_id}"))
        .map_err(|e| format!("FxTwitter API URLの生成に失敗しました: {e}"))?;
    if let Some(language) = translation_language {
        endpoint.query_pairs_mut().append_pair("lang", &language);
    }
    Ok(endpoint)
}

fn youtube_watch_url(video_id: &str) -> Result<Url, String> {
    if video_id.len() != 11
        || !video_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
    {
        return Err("YouTubeの動画IDが不正です".to_string());
    }
    Url::parse(&format!("https://www.youtube.com/watch?v={video_id}"))
        .map_err(|e| format!("YouTube動画URLの生成に失敗しました: {e}"))
}

fn youtube_oembed_url(video_id: &str) -> Result<Url, String> {
    let watch_url = youtube_watch_url(video_id)?;
    let mut endpoint = Url::parse("https://www.youtube.com/oembed")
        .map_err(|e| format!("YouTube oEmbed URLの生成に失敗しました: {e}"))?;
    endpoint
        .query_pairs_mut()
        .append_pair("url", watch_url.as_str())
        .append_pair("format", "json");
    Ok(endpoint)
}

fn extract_youtube_oembed_title(body: &[u8]) -> Option<String> {
    serde_json::from_slice::<serde_json::Value>(body)
        .ok()?
        .get("title")?
        .as_str()
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_youtube_video_title(html: &str) -> Option<String> {
    let document = kuchikiki::parse_html().one(html).document_node;
    let metadata = document.select_first(r#"meta[property="og:title"]"#).ok()?;
    let title = metadata
        .attributes
        .borrow()
        .get("content")
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(ToOwned::to_owned);
    title
}

fn extract_participant_count(html: &str) -> Option<u32> {
    static PARTICIPANT_COUNT_REGEX: OnceLock<regex::Regex> = OnceLock::new();
    let regex = PARTICIPANT_COUNT_REGEX.get_or_init(|| {
        regex::Regex::new(
            r"現在の参加者(?:\s|&nbsp;)*[:：](?:\s|&nbsp;)*([0-9]+)(?:\s|&nbsp;)*(?:名|人)",
        )
        .expect("participant-count regex must be valid")
    });

    regex.captures(html)?.get(1)?.as_str().parse::<u32>().ok()
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
        target_language: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let endpoint = fxtwitter_status_endpoint(status_id, target_language)?;
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

    pub async fn fetch_youtube_video_title(
        &self,
        video_id: &str,
    ) -> Result<Option<String>, String> {
        let oembed_url = youtube_oembed_url(video_id)?;
        let watch_url = youtube_watch_url(video_id)?;
        self.fetch_youtube_video_title_from_urls(oembed_url, watch_url)
            .await
    }

    async fn fetch_youtube_video_title_from_urls(
        &self,
        oembed_url: Url,
        watch_url: Url,
    ) -> Result<Option<String>, String> {
        if let Ok(response) = self
            .client
            .get(oembed_url)
            .header(USER_AGENT, "Midoku Bosatsu YouTube Preview")
            .header(ACCEPT, "application/json")
            .send()
            .await
        {
            if response.status().is_success() {
                if let Ok(body) = response.bytes().await {
                    if let Some(title) = extract_youtube_oembed_title(&body) {
                        return Ok(Some(title));
                    }
                }
            }
        }

        let response = self
            .client
            .get(watch_url)
            .header(USER_AGENT, "Midoku Bosatsu YouTube Preview")
            .header(ACCEPT, "text/html")
            .send()
            .await
            .map_err(|e| format!("YouTube動画ページの取得に失敗しました: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "YouTube動画ページがHTTPエラーを返しました: {} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }
        let html = response
            .text()
            .await
            .map_err(|e| format!("YouTube動画ページの読み込みに失敗しました: {e}"))?;
        Ok(extract_youtube_video_title(&html))
    }

    pub async fn fetch_twitter_card_preview(
        &self,
        raw_url: &str,
    ) -> Result<Option<TwitterCardPreview>, String> {
        tokio::time::timeout(
            TWITTER_CARD_REQUEST_TIMEOUT,
            self.fetch_twitter_card_preview_inner(raw_url),
        )
        .await
        .map_err(|_| "Twitter Cardプレビューの取得がタイムアウトしました".to_string())?
    }

    async fn fetch_twitter_card_preview_inner(
        &self,
        raw_url: &str,
    ) -> Result<Option<TwitterCardPreview>, String> {
        let page_url = twitter_card_page_url(raw_url)?;
        let (page_url, mut response) = fetch_protected_preview_response(
            page_url,
            "text/html,application/xhtml+xml",
            twitter_card_page_url,
        )
        .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "Twitter CardページがHTTPエラーを返しました: {} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            ));
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !twitter_card_content_type_is_html(&content_type) {
            return Ok(None);
        }
        let Some(body) =
            read_limited_response(&mut response, TWITTER_CARD_HTML_LIMIT_BYTES).await?
        else {
            return Ok(None);
        };
        let html = decode_twitter_card_html(&body, &content_type);
        let Some(mut preview) = extract_twitter_card_preview(&html, &page_url) else {
            return Ok(None);
        };

        if !preview.image_url.is_empty() {
            preview.image_url = self
                .fetch_twitter_card_image_data_url(&preview.image_url)
                .await
                .unwrap_or_default();
        }
        Ok(Some(preview))
    }

    async fn fetch_twitter_card_image_data_url(&self, raw_url: &str) -> Option<String> {
        let image_url = twitter_card_resource_url(raw_url).ok()?;
        let (_, mut response) = fetch_protected_preview_response(
            image_url,
            "image/avif,image/bmp,image/gif,image/jpeg,image/png,image/webp",
            twitter_card_resource_url,
        )
        .await
        .ok()?;
        if !response.status().is_success() {
            return None;
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())?
            .to_string();
        let body = read_limited_response(&mut response, TWITTER_CARD_IMAGE_LIMIT_BYTES)
            .await
            .ok()??;
        twitter_card_image_data_url(&content_type, &body)
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
            participant_count: extract_participant_count(&html),
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
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn youtube_title_fallback_server(
        oembed_status: &'static str,
        oembed_body: &'static str,
    ) -> (Url, Url, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            for (expected_path, status, content_type, body) in [
                ("/oembed", oembed_status, "application/json", oembed_body),
                (
                    "/watch",
                    "200 OK",
                    "text/html; charset=utf-8",
                    r#"<meta property="og:title" content="ナンパというアングラの恩恵">"#,
                ),
            ] {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0_u8; 2048];
                let size = stream.read(&mut request).unwrap();
                let request = String::from_utf8_lossy(&request[..size]);
                assert!(request.starts_with(&format!("GET {expected_path} HTTP/1.1")));
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len(),
                )
                .unwrap();
            }
        });

        (
            Url::parse(&format!("http://{address}/oembed")).unwrap(),
            Url::parse(&format!("http://{address}/watch")).unwrap(),
            handle,
        )
    }

    fn youtube_oembed_success_server() -> (Url, Url, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let size = stream.read(&mut request).unwrap();
            let request = String::from_utf8_lossy(&request[..size]);
            assert!(request.starts_with("GET /oembed HTTP/1.1"));
            let body = r#"{"title":"oEmbed title"}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len(),
            )
            .unwrap();
        });

        (
            Url::parse(&format!("http://{address}/oembed")).unwrap(),
            Url::parse(&format!("http://{address}/watch")).unwrap(),
            handle,
        )
    }

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
                gzip: true,
            },
        }
    }

    #[test]
    fn extracts_participant_count_with_regular_spaces_and_name_unit() {
        assert_eq!(extract_participant_count("現在の参加者 : 27名"), Some(27));
    }

    #[test]
    fn extracts_participant_count_with_non_breaking_spaces_and_person_unit() {
        assert_eq!(
            extract_participant_count("現在の参加者\u{00a0}:\u{00a0}8人"),
            Some(8)
        );
    }

    #[test]
    fn participant_count_is_missing_when_the_label_does_not_match() {
        assert_eq!(extract_participant_count("参加人数 : 12名"), None);
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
            fxtwitter_status_endpoint("123456789", None)
                .unwrap()
                .as_str(),
            "https://api.fxtwitter.com/2/status/123456789"
        );
        assert!(fxtwitter_status_endpoint("https://example.com/", None).is_err());
        assert!(fxtwitter_status_endpoint("123/../../private", None).is_err());
    }

    #[test]
    fn fxtwitter_status_endpoint_adds_a_valid_translation_language() {
        assert_eq!(
            fxtwitter_status_endpoint("123456789", Some("ja"))
                .unwrap()
                .as_str(),
            "https://api.fxtwitter.com/2/status/123456789?lang=ja"
        );
        assert!(fxtwitter_status_endpoint("123456789", Some("japanese")).is_err());
    }

    #[test]
    fn extracts_youtube_title_from_open_graph_metadata() {
        let html = r#"
          <html><head>
            <meta property="og:title" content="&quot;Weird Al&quot; Yankovic - Eat It (Official 4K Video)">
          </head></html>
        "#;

        assert_eq!(
            extract_youtube_video_title(html),
            Some("\"Weird Al\" Yankovic - Eat It (Official 4K Video)".to_string())
        );
    }

    #[test]
    fn builds_youtube_oembed_url_for_the_video_id() {
        assert_eq!(
            youtube_oembed_url("Ue6karQMOlI").unwrap().as_str(),
            "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DUe6karQMOlI&format=json",
        );
    }

    #[test]
    fn extracts_non_empty_youtube_title_from_oembed_json() {
        assert_eq!(
            extract_youtube_oembed_title(r#"{"title":" ナンパというアングラの恩恵 "}"#.as_bytes()),
            Some("ナンパというアングラの恩恵".to_string()),
        );
        assert_eq!(extract_youtube_oembed_title(br#"{"title":""}"#), None);
    }

    #[test]
    fn uses_youtube_oembed_title_without_fetching_the_html() {
        let (oembed_url, watch_url, server) = youtube_oembed_success_server();
        let state = ReaderState::new().unwrap();

        let title = tauri::async_runtime::block_on(
            state.fetch_youtube_video_title_from_urls(oembed_url, watch_url),
        )
        .unwrap();

        assert_eq!(title, Some("oEmbed title".to_string()));
        server.join().unwrap();
    }

    #[test]
    fn falls_back_to_youtube_html_when_oembed_title_is_empty() {
        let (oembed_url, watch_url, server) =
            youtube_title_fallback_server("200 OK", r#"{"title":""}"#);
        let state = ReaderState::new().unwrap();

        let title = tauri::async_runtime::block_on(
            state.fetch_youtube_video_title_from_urls(oembed_url, watch_url),
        )
        .unwrap();

        assert_eq!(title, Some("ナンパというアングラの恩恵".to_string()));
        server.join().unwrap();
    }

    #[test]
    fn falls_back_to_youtube_html_when_oembed_returns_an_http_error() {
        let (oembed_url, watch_url, server) =
            youtube_title_fallback_server("500 Internal Server Error", "failed");
        let state = ReaderState::new().unwrap();

        let title = tauri::async_runtime::block_on(
            state.fetch_youtube_video_title_from_urls(oembed_url, watch_url),
        )
        .unwrap();

        assert_eq!(title, Some("ナンパというアングラの恩恵".to_string()));
        server.join().unwrap();
    }

    #[test]
    fn twitter_card_page_url_accepts_only_http_urls_without_credentials() {
        assert_eq!(
            twitter_card_page_url("https://example.com/articles/42")
                .unwrap()
                .as_str(),
            "https://example.com/articles/42"
        );
        assert!(twitter_card_page_url("file:///etc/passwd").is_err());
        assert!(twitter_card_page_url("https://user:password@example.com/").is_err());
        assert!(twitter_card_page_url("not a URL").is_err());
    }

    #[test]
    fn twitter_card_page_url_rejects_excluded_sites_and_media_extensions() {
        for url in [
            "https://x.com./example/status/123",
            "https://mobile.twitter.com/example/status/123",
            "https://www.youtube.com/watch?v=abcdefghijk",
            "https://youtu.be/abcdefghijk",
            "https://example.com/photo.JPG?large=1",
            "https://example.com/video.mp4#player",
        ] {
            assert!(twitter_card_page_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn twitter_card_page_url_rejects_local_and_non_public_ip_literals() {
        for url in [
            "http://localhost/",
            "http://localhost./",
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
            "http://192.168.1.1/",
            "http://[::1]/",
            "http://[fd00::1]/",
            "http://[fe80::1]/",
            "http://[2001:db8::1]/",
        ] {
            assert!(twitter_card_page_url(url).is_err(), "{url}");
        }
        assert!(twitter_card_page_url("https://8.8.8.8/").is_ok());
    }

    #[test]
    fn extracts_twitter_card_metadata_and_resolves_relative_image_url() {
        let html = r#"
          <html><head>
            <meta name="twitter:title" content="Twitter &amp; Card title">
            <meta name="twitter:description" content="Card description">
            <meta name="twitter:image" content="/images/card.jpg">
            <meta name="twitter:site" content="@example_screen_name">
            <meta property="og:site_name" content="Example News">
          </head></html>
        "#;
        let page_url = Url::parse("https://example.com/articles/42").unwrap();

        assert_eq!(
            extract_twitter_card_preview(html, &page_url),
            Some(TwitterCardPreview {
                url: "https://example.com/articles/42".to_string(),
                title: "Twitter & Card title".to_string(),
                description: "Card description".to_string(),
                image_url: "https://example.com/images/card.jpg".to_string(),
                site_name: "Example News".to_string(),
            })
        );
    }

    #[test]
    fn falls_back_to_open_graph_and_html_title_metadata() {
        let html = r#"
          <html><head>
            <title>HTML title</title>
            <meta name="twitter:site" content="@screen_name_only">
            <meta property="og:description" content="Open Graph description">
            <meta property="og:image" content="https://cdn.example.com/card.png">
          </head></html>
        "#;
        let page_url = Url::parse("https://example.com/").unwrap();

        assert_eq!(
            extract_twitter_card_preview(html, &page_url),
            Some(TwitterCardPreview {
                url: "https://example.com/".to_string(),
                title: "HTML title".to_string(),
                description: "Open Graph description".to_string(),
                image_url: "https://cdn.example.com/card.png".to_string(),
                site_name: "example.com".to_string(),
            })
        );
    }

    #[test]
    fn ignores_pages_without_card_content() {
        let page_url = Url::parse("https://example.com/").unwrap();
        assert_eq!(
            extract_twitter_card_preview("<html><body>Plain</body></html>", &page_url),
            None
        );
    }

    #[test]
    fn encodes_only_supported_raster_preview_images_as_data_urls() {
        assert_eq!(
            twitter_card_image_data_url("image/png", &[0x89, b'P', b'N', b'G']),
            Some("data:image/png;base64,iVBORw==".to_string())
        );
        assert_eq!(
            twitter_card_image_data_url("image/svg+xml", b"<svg/>"),
            None
        );
        assert_eq!(twitter_card_image_data_url("text/html", b"<html>"), None);
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
