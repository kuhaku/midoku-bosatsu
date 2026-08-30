use kuchikiki::{traits::*, NodeRef};
use regex::Regex;

use crate::{
    config::{ReloadFormConfig, SiteConfig},
    model::{FormField, ParsedReloadForm},
};

use super::encoding::encode_form_component;

pub fn parse_reload_form(html: &str, site: &SiteConfig) -> Result<ParsedReloadForm, String> {
    let document = kuchikiki::parse_html().one(html).document_node;
    let forms = document
        .select(&site.reload_form.form_selector)
        .map_err(|_| {
            format!(
                "不正なform_selectorです: {}",
                site.reload_form.form_selector
            )
        })?;

    let submit_value_regex = compile_submit_value_regex(&site.reload_form)?;
    let mut matched_form_count = 0usize;

    // form_selector が複数FORMに一致しても、未読リロード用 submit を含むFORMを選ぶ。
    // nameの変更にはfallback/value正規表現でも追従できる。
    for form in forms {
        matched_form_count += 1;
        if let Some(parsed) =
            parse_form_candidate(form.as_node(), site, submit_value_regex.as_ref())?
        {
            return Ok(parsed);
        }
    }

    if matched_form_count == 0 {
        return Err(format!(
            "FORMが見つかりません: {}",
            site.reload_form.form_selector
        ));
    }

    let mut expected_names = vec![site.reload_form.submit_input_name.clone()];
    expected_names.extend(site.reload_form.submit_input_name_fallbacks.iter().cloned());

    Err(format!(
        "未読リロード用INPUTを含むFORMが見つかりません: names={:?}, value_regex={:?}",
        expected_names, site.reload_form.submit_value_regex
    ))
}

fn compile_submit_value_regex(config: &ReloadFormConfig) -> Result<Option<Regex>, String> {
    let pattern = config.submit_value_regex.trim();
    if pattern.is_empty() {
        return Ok(None);
    }

    Regex::new(pattern)
        .map(Some)
        .map_err(|e| format!("submit_value_regex が不正です ({pattern}): {e}"))
}

fn is_reload_submit(
    name: &str,
    value: &str,
    config: &ReloadFormConfig,
    value_regex: Option<&Regex>,
) -> bool {
    name == config.submit_input_name
        || config
            .submit_input_name_fallbacks
            .iter()
            .any(|fallback| fallback == name)
        || value_regex.is_some_and(|regex| regex.is_match(value))
}

fn parse_form_candidate(
    form_node: &NodeRef,
    site: &SiteConfig,
    submit_value_regex: Option<&Regex>,
) -> Result<Option<ParsedReloadForm>, String> {
    let Some(form_element) = form_node.as_element() else {
        return Ok(None);
    };

    let form_attrs = form_element.attributes.borrow();
    let action = form_attrs.get("action").map(str::to_owned);
    let method = site.reload_form.method.to_ascii_uppercase();
    drop(form_attrs);

    let mut fields = Vec::new();
    let mut submit_found = false;

    // CSS selectorは実DOM要素だけを対象にするため、
    // <!-- <input ...> --> のようなコメント内INPUTはここには現れない。
    for input in form_node
        .select("input")
        .map_err(|_| "input selector の解析に失敗しました".to_string())?
    {
        let attrs = input.attributes.borrow();

        if attrs.contains("disabled") {
            continue;
        }

        let Some(name) = attrs.get("name") else {
            continue;
        };
        if name.is_empty() {
            continue;
        }

        let input_type = attrs.get("type").unwrap_or("text").to_ascii_lowercase();
        let value = attrs.get("value").unwrap_or({
            if matches!(input_type.as_str(), "checkbox" | "radio") {
                "on"
            } else {
                ""
            }
        });

        let reload_submit = matches!(input_type.as_str(), "submit" | "image")
            && is_reload_submit(name, value, &site.reload_form, submit_value_regex);

        match input_type.as_str() {
            "reset" | "button" => continue,
            "submit" | "image" if !reload_submit => continue,
            "checkbox" | "radio" if !attrs.contains("checked") => continue,
            _ => {}
        }

        if reload_submit {
            submit_found = true;
        }

        fields.push(FormField {
            name: name.to_owned(),
            value: value.to_owned(),
        });
    }

    if !submit_found {
        return Ok(None);
    }

    Ok(Some(ParsedReloadForm {
        action,
        method,
        referer: site.reload_form.referer.clone(),
        fields,
    }))
}

pub fn encode_reload_form(
    form: &ParsedReloadForm,
    encoding_label: &str,
) -> Result<Vec<u8>, String> {
    let mut pairs = Vec::with_capacity(form.fields.len());

    for field in &form.fields {
        let name = encode_form_component(&field.name, encoding_label)?;
        let value = encode_form_component(&field.value, encoding_label)?;
        pairs.push(format!("{name}={value}"));
    }

    // percent-encoded後はASCIIのみなので、そのままHTTP bodyのbyte列にできる。
    Ok(pairs.join("&").into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{FetchConfig, PostParserConfig, ReloadFormConfig};

    fn site_config() -> SiteConfig {
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
                referer: "https://example.invalid/bbs.cgi".into(),
                include_hidden: true,
            },
        }
    }

    #[test]
    fn parses_reload_form_after_html_parse_finalization() {
        let html = r#"
            <form action="/bbs.cgi" method="post">
              <input type="hidden" name="token" value="abc">
              <input type="submit" name="midokureload" value="未読">
            </form>
        "#;

        let parsed = parse_reload_form(html, &site_config()).unwrap();

        assert!(parsed
            .fields
            .iter()
            .any(|field| field.name == "midokureload"));
    }

    #[test]
    fn commented_inputs_are_not_submitted_and_hidden_is_included() {
        let html = r#"
            <form action="/bbs.cgi" method="post">
              <input type="hidden" name="hidden_token" value="abc">
              <!-- <input type="hidden" name="commented" value="DO_NOT_SEND"> -->
              <input type="text" name="n" value="名無し">
              <input type="checkbox" name="checked" value="1" checked>
              <input type="checkbox" name="unchecked" value="1">
              <input type="submit" name="post" value="投稿">
              <input type="submit" name="midokureload" value="未読">
            </form>
        "#;

        let parsed = parse_reload_form(html, &site_config()).unwrap();
        let names: Vec<&str> = parsed
            .fields
            .iter()
            .map(|field| field.name.as_str())
            .collect();

        assert!(names.contains(&"hidden_token"));
        assert!(names.contains(&"n"));
        assert!(names.contains(&"checked"));
        assert!(names.contains(&"midokureload"));
        assert!(!names.contains(&"commented"));
        assert!(!names.contains(&"unchecked"));
        assert!(!names.contains(&"post"));
    }

    #[test]
    fn hidden_inputs_are_included_even_when_legacy_flag_is_disabled() {
        let mut site = site_config();
        site.reload_form.include_hidden = false;
        let html = r#"
            <form action="/bbs.cgi" method="post">
              <input type="hidden" name="token" value="abc">
              <input type="submit" name="midokureload" value="未読">
            </form>
        "#;

        let parsed = parse_reload_form(html, &site).unwrap();

        assert!(parsed
            .fields
            .iter()
            .any(|field| { field.name == "token" && field.value == "abc" }));
    }

    #[test]
    fn picks_the_form_that_contains_reload_submit() {
        let html = r#"
            <form action="/search.cgi">
              <input type="text" name="q" value="test">
            </form>
            <form action="/bbs.cgi" method="post">
              <input type="hidden" name="token" value="abc">
              <input type="submit" name="midokureload" value="未読">
            </form>
        "#;

        let parsed = parse_reload_form(html, &site_config()).unwrap();
        assert_eq!(parsed.action.as_deref(), Some("/bbs.cgi"));
        assert!(parsed.fields.iter().any(|field| field.name == "token"));
        assert!(parsed
            .fields
            .iter()
            .any(|field| field.name == "midokureload"));
    }

    #[test]
    fn accepts_fallback_submit_name() {
        let mut site = site_config();
        site.reload_form.submit_input_name_fallbacks = vec!["meload".into()];

        let html = r#"
            <form action="/bbs.cgi" method="post">
              <input type="hidden" name="p" value="50">
              <input type="submit" name="meload" value="未読">
            </form>
        "#;

        let parsed = parse_reload_form(html, &site).unwrap();
        assert!(parsed.fields.iter().any(|field| field.name == "meload"));
    }

    #[test]
    fn accepts_reload_button_by_value_regex_when_name_changes() {
        let mut site = site_config();
        site.reload_form.submit_value_regex = "未読".into();

        let html = r#"
            <form action="/bbs.php" method="post">
              <input type="hidden" name="u" value="1">
              <input type="submit" name="readnew2" value="未読リロード">
              <input type="submit" name="post" value="投稿">
            </form>
        "#;

        let parsed = parse_reload_form(html, &site).unwrap();
        assert!(parsed.fields.iter().any(|field| field.name == "readnew2"));
        assert!(!parsed.fields.iter().any(|field| field.name == "post"));
    }
}
