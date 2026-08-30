use chrono::{FixedOffset, TimeZone};
use kuchikiki::{traits::*, NodeRef};
use regex::Regex;
use reqwest::Url;

use crate::{config::SiteConfig, model::ParsedPost};

pub fn parse_posts(html: &str, site: &SiteConfig) -> Result<Vec<ParsedPost>, String> {
    match site.post_parser.mode.as_str() {
        "legacy_anchor_siblings" => parse_legacy_anchor_siblings(html, site),
        "css_post" => parse_css_posts(html, site),
        other => Err(format!("未対応のpost_parser.modeです: {other}")),
    }
}

fn parse_legacy_anchor_siblings(html: &str, site: &SiteConfig) -> Result<Vec<ParsedPost>, String> {
    let document = kuchikiki::parse_html().one(html).document_node;
    let date_regex = compile_timestamp_regex(site)?;

    let anchors = document
        .select(&site.post_parser.anchor_selector)
        .map_err(|_| {
            format!(
                "不正なanchor_selectorです: {}",
                site.post_parser.anchor_selector
            )
        })?;

    let mut posts = Vec::new();

    for anchor_match in anchors {
        let anchor = anchor_match.as_node();
        let id = {
            let attrs = anchor_match.attributes.borrow();
            let Some(value) = attrs.get(site.post_parser.id_attribute.as_str()) else {
                continue;
            };
            if value.is_empty() {
                continue;
            }
            value.to_owned()
        };

        // Perl版くずは系では、投稿アンカーの後ろへ
        // FONT(題名) -> B(投稿者) -> FONT(日時) -> BLOCKQUOTE -> PRE の順で並ぶ。
        // a[name] はページ内の別用途にも使われるため、チェーンが成立しなければスキップする。
        let Some(header) = next_element_with_tag(anchor, &site.post_parser.header_tag) else {
            continue;
        };
        let Some(name_node) = next_element_with_tag(&header, &site.post_parser.name_tag) else {
            continue;
        };
        let Some(info) = next_element_with_tag(&name_node, &site.post_parser.info_tag) else {
            continue;
        };
        let Some(blockquote) = next_element_with_tag(&info, &site.post_parser.body_container_tag)
        else {
            continue;
        };
        let Some(body) = first_child_element_with_tag(&blockquote, &site.post_parser.body_tag)
        else {
            continue;
        };

        let title = first_child_text_or_element_text(&header);
        let name = name_node.text_contents().trim().to_owned();
        let email = extract_mailto_email(&name_node);

        let info_head = first_direct_text(&info).unwrap_or_else(|| info.text_contents());
        let Some(posted_at_raw) =
            extract_timestamp_text(&info_head, &site.post_parser.date_prefix, &date_regex)
        else {
            continue;
        };

        let posted_at = parse_timestamp(&posted_at_raw, &date_regex, site.timezone_offset_minutes);
        let (follow_url, thread_url) = extract_post_action_links(&info, site);
        let parent_id = extract_parent_reference_id(&body, site, &id);
        let thread_id = extract_thread_id(thread_url.as_deref(), site)
            .or_else(|| parent_id.is_none().then(|| id.clone()));

        posts.push(ParsedPost {
            id,
            site_id: site.id.clone(),
            title,
            name,
            email,
            posted_at_raw,
            posted_at,
            follow_url,
            thread_url,
            parent_id,
            thread_id,
            body_html: inner_html(&body),
            body_text: body.text_contents(),
        });
    }

    Ok(posts)
}

/// KuzuhaScriptPHP+など「1投稿 = 1つの親要素」で表現されるHTML向け。
/// 投稿・題名・投稿者・日時・本文をCSS selectorで設定ファイルから指定する。
fn parse_css_posts(html: &str, site: &SiteConfig) -> Result<Vec<ParsedPost>, String> {
    let cfg = &site.post_parser;
    let document = kuchikiki::parse_html().one(html).document_node;
    let date_regex = compile_timestamp_regex(site)?;

    if cfg.post_selector.trim().is_empty() {
        return Err(format!("{}: css_post の post_selector が空です", site.id));
    }
    if cfg.post_id_attribute.trim().is_empty() {
        return Err(format!(
            "{}: css_post の post_id_attribute が空です",
            site.id
        ));
    }
    if cfg.date_selector.trim().is_empty() || cfg.body_selector.trim().is_empty() {
        return Err(format!(
            "{}: css_post の date_selector/body_selector が空です",
            site.id
        ));
    }

    let post_matches = document
        .select(&cfg.post_selector)
        .map_err(|_| format!("不正なpost_selectorです: {}", cfg.post_selector))?;

    let mut posts = Vec::new();

    for post_match in post_matches {
        let post_node = post_match.as_node();
        let mut id = {
            let attrs = post_match.attributes.borrow();
            let Some(value) = attrs.get(cfg.post_id_attribute.as_str()) else {
                continue;
            };
            value.trim().to_owned()
        };

        if !cfg.post_id_prefix.is_empty() {
            let Some(stripped) = id.strip_prefix(&cfg.post_id_prefix) else {
                continue;
            };
            id = stripped.to_owned();
        }
        if id.is_empty() {
            continue;
        }

        let title = select_text_optional(post_node, &cfg.title_selector)?;
        let name_node = if cfg.name_selector.trim().is_empty() {
            None
        } else {
            select_first(post_node, &cfg.name_selector)?
        };
        let name = name_node
            .as_ref()
            .map(|node| node.text_contents().trim().to_owned())
            .unwrap_or_default();
        let email = name_node
            .as_ref()
            .map(extract_mailto_email)
            .unwrap_or_default();

        let Some(date_node) = select_first(post_node, &cfg.date_selector)? else {
            continue;
        };
        let date_text = date_node.text_contents();
        let Some(posted_at_raw) = extract_timestamp_text(&date_text, &cfg.date_prefix, &date_regex)
        else {
            continue;
        };

        let Some(body) = select_first(post_node, &cfg.body_selector)? else {
            continue;
        };

        let posted_at = parse_timestamp(&posted_at_raw, &date_regex, site.timezone_offset_minutes);

        let (mut follow_url, mut thread_url) = extract_post_action_links(&date_node, site);
        if follow_url.is_none() || thread_url.is_none() {
            let (post_follow, post_thread) = extract_post_action_links(post_node, site);
            if follow_url.is_none() {
                follow_url = post_follow;
            }
            if thread_url.is_none() {
                thread_url = post_thread;
            }
        }

        let parent_id = extract_parent_reference_id(&body, site, &id);
        let thread_id = extract_thread_id(thread_url.as_deref(), site)
            .or_else(|| parent_id.is_none().then(|| id.clone()));

        posts.push(ParsedPost {
            id,
            site_id: site.id.clone(),
            title,
            name,
            email,
            posted_at_raw,
            posted_at,
            follow_url,
            thread_url,
            parent_id,
            thread_id,
            body_html: inner_html(&body),
            body_text: body.text_contents(),
        });
    }

    Ok(posts)
}

/// くずは系のフォロー投稿には本文末尾へ「参考：日時」のリンクが入り、
/// そのhrefが直接の親投稿を指す。KuzuhaScriptPHP+系も同様のラベルを
/// 使う場合があるため、リンク文字列を基準に共通抽出する。
fn extract_parent_reference_id(node: &NodeRef, site: &SiteConfig, own_id: &str) -> Option<String> {
    let Ok(links) = node.select("a[href]") else {
        return None;
    };

    for link in links {
        let label = link.text_contents();
        let label = label.trim();
        if !(label.starts_with("参考：") || label.starts_with("参考:")) {
            continue;
        }

        let href = {
            let attrs = link.attributes.borrow();
            attrs
                .get("href")
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        };
        let Some(href) = href else {
            continue;
        };
        let Some(candidate) = extract_post_id_from_href(&href, site) else {
            continue;
        };
        if candidate != own_id {
            return Some(candidate);
        }
    }

    None
}

fn extract_thread_id(thread_url: Option<&str>, site: &SiteConfig) -> Option<String> {
    let href = thread_url?.trim();
    if href.is_empty() {
        return None;
    }
    extract_post_id_from_href(href, site)
}

fn extract_post_id_from_href(href: &str, site: &SiteConfig) -> Option<String> {
    let base = Url::parse(&site.fetch.url).ok();
    let parsed = Url::parse(href)
        .ok()
        .or_else(|| base.as_ref().and_then(|base| base.join(href).ok()));

    if let Some(url) = parsed {
        for key in ["s", "search"] {
            if let Some((_, value)) = url.query_pairs().find(|(name, _)| name.as_ref() == key) {
                let value = value.trim();
                if !value.is_empty() {
                    return Some(value.to_owned());
                }
            }
        }

        if let Some(fragment) = url.fragment() {
            let fragment = fragment.trim();
            if !fragment.is_empty() {
                return Some(fragment.to_owned());
            }
        }
    }

    // ページ内リンクだけの古い形式（#12345）も許可する。
    href.strip_prefix('#')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn extract_post_action_links(
    node: &NodeRef,
    site: &SiteConfig,
) -> (Option<String>, Option<String>) {
    let Ok(links) = node.select("a[href]") else {
        return (None, None);
    };

    let base = Url::parse(&site.fetch.url).ok();
    let mut follow_url = None;
    let mut thread_url = None;

    for link in links {
        let label = link.text_contents();
        let label = label.trim();
        let is_follow = matches!(label, "■" | "□" | "⬛" | "⬛︎");
        let is_thread = matches!(label, "◆" | "◇");
        if !is_follow && !is_thread {
            continue;
        }

        let href = {
            let attrs = link.attributes.borrow();
            attrs
                .get("href")
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        };
        let Some(href) = href else {
            continue;
        };

        let resolved = base
            .as_ref()
            .and_then(|base| base.join(&href).ok())
            .filter(|url| matches!(url.scheme(), "http" | "https"))
            .map(|url| url.to_string())
            .unwrap_or(href);

        if is_follow && follow_url.is_none() {
            follow_url = Some(resolved.clone());
        }
        if is_thread && thread_url.is_none() {
            thread_url = Some(resolved);
        }
    }

    (follow_url, thread_url)
}

fn extract_mailto_email(node: &NodeRef) -> String {
    let Ok(links) = node.select("a[href]") else {
        return String::new();
    };

    for link in links {
        let attrs = link.attributes.borrow();
        let Some(href) = attrs.get("href") else {
            continue;
        };
        let Some(prefix) = href.get(..7) else {
            continue;
        };
        if !prefix.eq_ignore_ascii_case("mailto:") {
            continue;
        }
        let Some(mailto_value) = href.get(7..) else {
            continue;
        };
        let address = mailto_value.split('?').next().unwrap_or("").trim();
        if !address.is_empty() {
            return address.to_owned();
        }
    }

    String::new()
}

fn compile_timestamp_regex(site: &SiteConfig) -> Result<Regex, String> {
    Regex::new(&site.post_parser.timestamp_regex)
        .map_err(|e| format!("timestamp_regex が不正です: {e}"))
}

fn extract_timestamp_text(text: &str, date_prefix: &str, regex: &Regex) -> Option<String> {
    let trimmed = text.trim();
    let without_prefix = if date_prefix.is_empty() {
        trimmed
    } else {
        trimmed.strip_prefix(date_prefix).unwrap_or(trimmed).trim()
    };

    // ボタンやナビゲーション文字列が同じ要素内にあっても、日時部分だけを返す。
    regex
        .find(without_prefix)
        .map(|m| m.as_str().trim().to_owned())
}

fn select_text_optional(start: &NodeRef, selector: &str) -> Result<String, String> {
    if selector.trim().is_empty() {
        return Ok(String::new());
    }
    Ok(select_first(start, selector)?
        .map(|node| node.text_contents().trim().to_owned())
        .unwrap_or_default())
}

fn select_first(start: &NodeRef, selector: &str) -> Result<Option<NodeRef>, String> {
    let mut matches = start
        .select(selector)
        .map_err(|_| format!("不正なCSS selectorです: {selector}"))?;
    Ok(matches.next().map(|matched| matched.as_node().clone()))
}

fn next_element_with_tag(start: &NodeRef, tag: &str) -> Option<NodeRef> {
    let mut current = start.next_sibling();
    while let Some(node) = current {
        if tag_matches(&node, tag) {
            return Some(node);
        }
        current = node.next_sibling();
    }
    None
}

fn first_child_element_with_tag(start: &NodeRef, tag: &str) -> Option<NodeRef> {
    start.children().find(|node| tag_matches(node, tag))
}

fn tag_matches(node: &NodeRef, expected: &str) -> bool {
    node.as_element()
        .map(|element| element.name.local.as_ref().eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn first_direct_text(node: &NodeRef) -> Option<String> {
    for child in node.children() {
        if let Some(text) = child.as_text() {
            let value = text.borrow().to_string();
            if !value.trim().is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn first_child_text_or_element_text(node: &NodeRef) -> String {
    for child in node.children() {
        if let Some(text) = child.as_text() {
            let value = text.borrow().trim().to_owned();
            if !value.is_empty() {
                return value;
            }
            continue;
        }

        if child.as_element().is_some() {
            return child.text_contents().trim().to_owned();
        }
    }

    String::new()
}

fn inner_html(node: &NodeRef) -> String {
    let mut html = String::new();
    for child in node.children() {
        html.push_str(&child.to_string());
    }
    html
}

fn parse_timestamp(raw: &str, regex: &Regex, offset_minutes: i32) -> Option<String> {
    let captures = regex.captures(raw)?;
    let year: i32 = captures.name("year")?.as_str().parse().ok()?;
    let month: u32 = captures.name("month")?.as_str().parse().ok()?;
    let day: u32 = captures.name("day")?.as_str().parse().ok()?;
    let hour: u32 = captures.name("hour")?.as_str().parse().ok()?;
    let minute: u32 = captures.name("minute")?.as_str().parse().ok()?;
    let second: u32 = captures.name("second")?.as_str().parse().ok()?;

    let offset = FixedOffset::east_opt(offset_minutes.checked_mul(60)?)?;
    let datetime = offset
        .with_ymd_and_hms(year, month, day, hour, minute, second)
        .single()?;

    Some(datetime.to_rfc3339())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{FetchConfig, PostParserConfig, ReloadFormConfig};

    fn base_site(post_parser: PostParserConfig) -> SiteConfig {
        SiteConfig {
            id: "test".into(),
            name: "test".into(),
            enabled: true,
            encoding: "shift_jis".into(),
            user_agent: "test".into(),
            max_posts: 666,
            timezone_offset_minutes: 540,
            timezone_region: "東京".to_string(),
            badge_style: Default::default(),
            fetch: FetchConfig {
                url: "https://example.invalid/bbs.cgi".into(),
            },
            post_parser,
            reload_form: ReloadFormConfig {
                form_selector: "form".into(),
                submit_input_name: "midokureload".into(),
                submit_input_name_fallbacks: vec![],
                submit_value_regex: String::new(),
                method: "POST".into(),
                referer: "https://example.invalid/bbs.cgi".into(),
                include_hidden: true,
            },
        }
    }

    #[test]
    fn parses_legacy_kuzuha_shape() {
        let site = base_site(PostParserConfig {
            mode: "legacy_anchor_siblings".into(),
            anchor_selector: "a[name]".into(),
            id_attribute: "name".into(),
            header_tag: "font".into(),
            name_tag: "b".into(),
            info_tag: "font".into(),
            body_container_tag: "blockquote".into(),
            body_tag: "pre".into(),
            date_prefix: "投稿日：".into(),
            timestamp_regex: r"(?P<year>\d{4})/(?P<month>\d{2})/(?P<day>\d{2})\([^)]+\)(?P<hour>\d{2})時(?P<minute>\d{2})分(?P<second>\d{2})秒".into(),
            ..Default::default()
        });

        let html = r#"
          <html><body>
            <a name="12799999"></a>
            <font><b>＞</b></font>
            投稿者：<b><a href="mailto:test@example.com">名無し</a></b>
            <font>投稿日：2026/08/14(金)15時10分07秒 <a href="?m=f&s=12799999">■</a> <a href="?m=t&s=12799998">◆</a></font>
            <blockquote><pre>本文(;´Д`)<br><a href="https://example.com/">https://example.com/</a><br><br><a href="?m=f&s=12799998">参考：2026/08/14(金)15時00分00秒</a></pre></blockquote>
          </body></html>
        "#;

        let posts = parse_posts(html, &site).unwrap();
        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].id, "12799999");
        assert_eq!(posts[0].name, "名無し");
        assert_eq!(posts[0].email, "test@example.com");
        assert_eq!(posts[0].posted_at_raw, "2026/08/14(金)15時10分07秒");
        assert_eq!(
            posts[0].posted_at.as_deref(),
            Some("2026-08-14T15:10:07+09:00")
        );
        assert_eq!(
            posts[0].follow_url.as_deref(),
            Some("https://example.invalid/bbs.cgi?m=f&s=12799999")
        );
        assert_eq!(
            posts[0].thread_url.as_deref(),
            Some("https://example.invalid/bbs.cgi?m=t&s=12799998")
        );
        assert_eq!(posts[0].parent_id.as_deref(), Some("12799998"));
        assert_eq!(posts[0].thread_id.as_deref(), Some("12799998"));
    }

    #[test]
    fn parses_ksphp_css_shape() {
        let site = base_site(PostParserConfig {
            mode: "css_post".into(),
            post_selector: "div.m".into(),
            post_id_attribute: "id".into(),
            post_id_prefix: "m".into(),
            title_selector: ".ms".into(),
            name_selector: ".mun".into(),
            date_selector: ".md".into(),
            body_selector: "pre.msgnormal".into(),
            date_prefix: "投稿日：".into(),
            timestamp_regex: r"(?P<year>\d{4})/(?P<month>\d{2})/(?P<day>\d{2})\([^)]+\)(?P<hour>\d{2})時(?P<minute>\d{2})分(?P<second>\d{2})秒".into(),
            ..Default::default()
        });

        let html = r#"
          <div class="m" id="m2283089">
            <span class="ms">＞名無し</span>
            <span class="mun">おこめ名無し</span>
            <span class="md">投稿日：2026/08/14(金)15時20分30秒 <a href="?mode=follow&amp;search=2283089">■</a> <a href="?mode=thread&amp;search=2283000">◆</a></span>
            <div class="contents"><pre class="msgnormal">おこめ本文<br>2行目<br><br><a href="?mode=follow&amp;search=2283000">参考：2026/08/14(金)15時00分00秒</a></pre></div>
          </div>
        "#;

        let posts = parse_posts(html, &site).unwrap();
        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].id, "2283089");
        assert_eq!(posts[0].name, "おこめ名無し");
        assert_eq!(posts[0].posted_at_raw, "2026/08/14(金)15時20分30秒");
        assert!(posts[0].body_text.contains("おこめ本文"));
        assert!(posts[0]
            .follow_url
            .as_deref()
            .unwrap()
            .contains("mode=follow"));
        assert!(posts[0]
            .thread_url
            .as_deref()
            .unwrap()
            .contains("mode=thread"));
        assert_eq!(posts[0].parent_id.as_deref(), Some("2283000"));
        assert_eq!(posts[0].thread_id.as_deref(), Some("2283000"));
    }
}
