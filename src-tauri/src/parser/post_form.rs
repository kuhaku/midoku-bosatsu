use std::collections::HashMap;

use kuchikiki::{traits::*, NodeRef};

use crate::model::{
    BbsPostForm, BbsPostFormControl, BbsPostFormInput, BbsPostFormOption, FormField,
};

use super::encoding::encode_form_component;

const POST_SUBMIT_NAMES: &[&str] = &["post", "submit", "send", "write", "writepost"];
const NON_POST_SUBMIT_NAMES: &[&str] = &[
    "preview",
    "reload",
    "midokureload",
    "meload",
    "readnew",
    "setup",
    "search",
    "pnext",
    "next",
];

/// 掲示板HTMLに含まれる通常投稿 / フォロー投稿FORMを探す。
///
/// kuchikiki のDOM selectorは実際の要素ノードだけを返すため、
/// `<!-- <input ...> -->` / `<!-- <textarea ...> -->` のようなコメント内タグは
/// controlsにもsubmit判定にも一切入らない。
pub fn parse_post_form(html: &str, source_url: &str) -> Result<Option<BbsPostForm>, String> {
    let document = kuchikiki::parse_html().one(html).document_node;
    let forms = document
        .select("form")
        .map_err(|_| "form selector の解析に失敗しました".to_string())?;

    let mut best: Option<(i32, BbsPostForm)> = None;

    for form in forms {
        let Some(candidate) = parse_post_form_candidate(form.as_node(), source_url)? else {
            continue;
        };
        let score = score_post_form(&candidate);
        if score <= 0 {
            continue;
        }
        if best
            .as_ref()
            .is_none_or(|(best_score, _)| score > *best_score)
        {
            best = Some((score, candidate));
        }
    }

    Ok(best.map(|(_, form)| form))
}

fn parse_post_form_candidate(
    form_node: &NodeRef,
    source_url: &str,
) -> Result<Option<BbsPostForm>, String> {
    let Some(form_element) = form_node.as_element() else {
        return Ok(None);
    };
    let attrs = form_element.attributes.borrow();
    let action = attrs.get("action").map(str::to_owned);
    let method = attrs.get("method").unwrap_or("GET").to_ascii_uppercase();
    drop(attrs);

    let submit_index = find_post_submit_index(form_node)?;
    let Some(submit_index) = submit_index else {
        return Ok(None);
    };

    let controls = parse_controls(form_node, submit_index)?;
    if controls.is_empty() {
        return Ok(None);
    }

    Ok(Some(BbsPostForm {
        source_url: source_url.to_owned(),
        action,
        method,
        controls,
    }))
}

fn find_post_submit_index(form_node: &NodeRef) -> Result<Option<usize>, String> {
    let nodes: Vec<_> = form_node
        .select("input, button")
        .map_err(|_| "submit selector の解析に失敗しました".to_string())?
        .collect();

    let mut best: Option<(i32, usize)> = None;
    for (index, node) in nodes.iter().enumerate() {
        let Some(element) = node.as_node().as_element() else {
            continue;
        };
        let attrs = element.attributes.borrow();
        if attrs.contains("disabled") {
            continue;
        }

        let tag = element.name.local.as_ref();
        let input_type = if tag.eq_ignore_ascii_case("button") {
            attrs.get("type").unwrap_or("submit").to_ascii_lowercase()
        } else {
            attrs.get("type").unwrap_or("text").to_ascii_lowercase()
        };
        if !matches!(input_type.as_str(), "submit" | "image") {
            continue;
        }

        let name = attrs.get("name").unwrap_or("");
        let value = attrs
            .get("value")
            .map(str::to_owned)
            .unwrap_or_else(|| node.text_contents().trim().to_owned());
        let score = score_post_submit(name, &value);
        if score <= 0 {
            continue;
        }
        if best
            .as_ref()
            .is_none_or(|(best_score, _)| score > *best_score)
        {
            best = Some((score, index));
        }
    }

    Ok(best.map(|(_, index)| index))
}

fn score_post_submit(name: &str, value: &str) -> i32 {
    let lower_name = name.trim().to_ascii_lowercase();
    let lower_value = value.trim().to_ascii_lowercase();
    let has_post_word =
        value.contains("投稿") || value.contains("書込") || value.contains("書き込み");

    // Kuzuha系には `meload=投稿／未読` のように投稿と未読を兼ねたsubmitもある。
    // 「未読」という語やreload系のnameだけで落とさず、投稿を明示していれば候補に残す。
    let always_non_post = matches!(
        lower_name.as_str(),
        "preview" | "setup" | "search" | "pnext" | "next"
    ) || lower_name.contains("preview")
        || lower_value.contains("プレビュー")
        || lower_value.contains("設定");
    let reload_only = (NON_POST_SUBMIT_NAMES
        .iter()
        .any(|candidate| lower_name == *candidate)
        || lower_name.contains("reload")
        || lower_value.contains("未読")
        || lower_value.contains("リロード"))
        && !has_post_word;
    if always_non_post || reload_only {
        return -100;
    }

    let mut score = 0;
    if POST_SUBMIT_NAMES
        .iter()
        .any(|candidate| lower_name == *candidate)
    {
        score += 40;
    }
    if has_post_word {
        score += 30;
    }
    if lower_value == "post" || lower_value == "submit" || lower_value.contains("send") {
        score += 20;
    }
    score
}

fn parse_controls(
    form_node: &NodeRef,
    submit_index: usize,
) -> Result<Vec<BbsPostFormControl>, String> {
    let nodes: Vec<_> = form_node
        .select("input, textarea, select, button")
        .map_err(|_| "投稿FORM control selector の解析に失敗しました".to_string())?
        .collect();

    // find_post_submit_index() は input/button のDOM順indexを返す。
    // textarea/selectを含む走査中でも別カウンタで同じsubmitだけを選ぶ。
    let mut controls = Vec::new();
    let mut next_id = 0usize;
    let mut input_button_index = 0usize;

    for node in nodes {
        let node_ref = node.as_node();
        let Some(element) = node_ref.as_element() else {
            continue;
        };
        let attrs = element.attributes.borrow();
        let tag = element.name.local.as_ref().to_ascii_lowercase();
        let current_input_button_index = if matches!(tag.as_str(), "input" | "button") {
            let index = input_button_index;
            input_button_index += 1;
            Some(index)
        } else {
            None
        };
        if attrs.contains("disabled") {
            continue;
        }
        let name = attrs.get("name").unwrap_or("").trim().to_owned();
        if name.is_empty() {
            continue;
        }

        let id = format!("field-{next_id}");
        next_id += 1;
        let required = attrs.contains("required");
        let readonly = attrs.contains("readonly");
        let maxlength = attrs
            .get("maxlength")
            .and_then(|value| value.parse::<usize>().ok());

        let control = match tag.as_str() {
            "textarea" => BbsPostFormControl {
                id,
                name: name.clone(),
                label: field_label(
                    &name,
                    attrs.get("aria-label"),
                    attrs.get("title"),
                    attrs.get("placeholder"),
                ),
                user_field: post_user_field(&name).map(str::to_owned),
                control_type: "textarea".to_string(),
                value: node_ref.text_contents(),
                checked: false,
                required,
                readonly,
                maxlength,
                options: Vec::new(),
            },
            "select" => {
                let mut options = Vec::new();
                let mut selected_value = String::new();
                let mut first_value = None;
                if let Ok(option_nodes) = node_ref.select("option") {
                    for option in option_nodes {
                        let option_attrs = option.attributes.borrow();
                        if option_attrs.contains("disabled") {
                            continue;
                        }
                        let text = option.text_contents().trim().to_owned();
                        let value = option_attrs
                            .get("value")
                            .unwrap_or(text.as_str())
                            .to_owned();
                        if first_value.is_none() {
                            first_value = Some(value.clone());
                        }
                        if option_attrs.contains("selected") && selected_value.is_empty() {
                            selected_value = value.clone();
                        }
                        options.push(BbsPostFormOption { value, label: text });
                    }
                }
                if selected_value.is_empty() {
                    selected_value = first_value.unwrap_or_default();
                }
                BbsPostFormControl {
                    id,
                    name: name.clone(),
                    label: field_label(&name, attrs.get("aria-label"), attrs.get("title"), None),
                    user_field: post_user_field(&name).map(str::to_owned),
                    control_type: "select".to_string(),
                    value: selected_value,
                    checked: false,
                    required,
                    readonly,
                    maxlength: None,
                    options,
                }
            }
            "input" | "button" => {
                let input_type = if tag == "button" {
                    attrs.get("type").unwrap_or("submit").to_ascii_lowercase()
                } else {
                    attrs.get("type").unwrap_or("text").to_ascii_lowercase()
                };

                if matches!(input_type.as_str(), "reset" | "button" | "file") {
                    continue;
                }

                if matches!(input_type.as_str(), "submit" | "image")
                    && current_input_button_index != Some(submit_index)
                {
                    continue;
                }

                let supported_type = match input_type.as_str() {
                    "hidden" | "text" | "email" | "url" | "password" | "search" | "tel"
                    | "number" | "checkbox" | "radio" | "submit" | "image" => input_type.as_str(),
                    _ => "text",
                };
                let value = attrs.get("value").unwrap_or({
                    if matches!(supported_type, "checkbox" | "radio") {
                        "on"
                    } else {
                        ""
                    }
                });
                BbsPostFormControl {
                    id,
                    name: name.clone(),
                    label: field_label(
                        &name,
                        attrs.get("aria-label"),
                        attrs.get("title"),
                        attrs.get("placeholder"),
                    ),
                    user_field: post_user_field(&name).map(str::to_owned),
                    control_type: if matches!(supported_type, "submit" | "image") {
                        "submit".to_string()
                    } else {
                        supported_type.to_string()
                    },
                    value: value.to_owned(),
                    checked: attrs.contains("checked"),
                    required,
                    readonly,
                    maxlength,
                    options: Vec::new(),
                }
            }
            _ => continue,
        };
        controls.push(control);
    }

    Ok(controls)
}

fn post_user_field(name: &str) -> Option<&'static str> {
    match name.trim().to_ascii_lowercase().as_str() {
        "u" | "name" | "uname" | "user" | "username" | "handle" | "author" => Some("author"),
        "i" | "mail" | "email" | "e_mail" | "mailaddr" => Some("email"),
        "t" | "title" | "subject" | "sub" => Some("subject"),
        "v" | "comment" | "comments" | "com" | "message" | "msg" | "body" | "text" => Some("body"),
        "l" | "url" | "link" | "uri" | "homepage" | "home" | "website" | "web" => Some("url"),
        _ => None,
    }
}

fn post_user_field_label(user_field: &str) -> &'static str {
    match user_field {
        "author" => "投稿者",
        "email" => "メール",
        "subject" => "題名",
        "body" => "内容",
        "url" => "URL",
        _ => "",
    }
}

fn is_user_editable_post_control(control: &BbsPostFormControl) -> bool {
    control.user_field.is_some()
        && !matches!(
            control.control_type.as_str(),
            "hidden" | "submit" | "checkbox" | "radio"
        )
}

fn field_label(
    name: &str,
    _aria_label: Option<&str>,
    _title: Option<&str>,
    _placeholder: Option<&str>,
) -> String {
    // 掲示板側のplaceholder/titleに「#ﾄﾘｯﾌﾟ使えます Alt(+Shift)+1」等があっても
    // 未読菩薩側では採用しない。5項目だけをnameから正規化し、それ以外は内部名にする。
    // 5項目以外はそもそもフロントエンドに入力欄として表示されない。
    if let Some(user_field) = post_user_field(name) {
        return post_user_field_label(user_field).to_string();
    }

    name.trim().to_string()
}

fn score_post_form(form: &BbsPostForm) -> i32 {
    if !form.method.eq_ignore_ascii_case("POST") {
        return -100;
    }

    let mut score = 0;
    for control in &form.controls {
        match control.control_type.as_str() {
            "textarea" => score += 30,
            "submit" => score += 20,
            _ => {}
        }
        let lower_name = control.name.to_ascii_lowercase();
        if lower_name == "v"
            || matches!(lower_name.as_str(), "comment" | "com" | "message" | "body")
        {
            score += 20;
        }
        if lower_name == "m" && control.value.eq_ignore_ascii_case("p") {
            score += 20;
        }
    }
    score
}

pub fn encode_post_form(
    form: &BbsPostForm,
    submitted: &[BbsPostFormInput],
    encoding_label: &str,
) -> Result<Vec<u8>, String> {
    let mut overrides = HashMap::new();
    for input in submitted {
        let control = form
            .controls
            .iter()
            .find(|control| control.id == input.id)
            .ok_or_else(|| format!("投稿FORMに存在しない項目です: {}", input.id))?;
        if !is_user_editable_post_control(control) {
            return Err(format!(
                "未読菩薩から編集できない投稿FORM項目です: {}",
                control.name
            ));
        }
        if overrides.insert(input.id.as_str(), input).is_some() {
            return Err(format!("同じ投稿FORM項目が重複しています: {}", input.id));
        }
    }

    let mut pairs = Vec::<FormField>::new();
    for control in &form.controls {
        match control.control_type.as_str() {
            "hidden" | "submit" => pairs.push(FormField {
                name: control.name.clone(),
                value: control.value.clone(),
            }),
            "checkbox" | "radio" => {
                let checked = overrides
                    .get(control.id.as_str())
                    .map(|input| input.checked)
                    .unwrap_or(control.checked);
                if checked {
                    pairs.push(FormField {
                        name: control.name.clone(),
                        value: control.value.clone(),
                    });
                }
            }
            "select" => {
                let value = overrides
                    .get(control.id.as_str())
                    .map(|input| input.value.as_str())
                    .unwrap_or(control.value.as_str());
                if !control.options.is_empty()
                    && !control.options.iter().any(|option| option.value == value)
                {
                    return Err(format!("投稿FORMの選択肢にない値です: {}", control.name));
                }
                pairs.push(FormField {
                    name: control.name.clone(),
                    value: value.to_owned(),
                });
            }
            _ => {
                let value = if control.readonly {
                    control.value.as_str()
                } else {
                    overrides
                        .get(control.id.as_str())
                        .map(|input| input.value.as_str())
                        .unwrap_or(control.value.as_str())
                };
                if control.required && value.trim().is_empty() {
                    return Err(format!("必須の投稿FORM項目が空です: {}", control.label));
                }
                if let Some(maxlength) = control.maxlength {
                    if value.chars().count() > maxlength {
                        return Err(format!("{} は最大{}文字です", control.label, maxlength));
                    }
                }
                let value = if control.control_type == "textarea" {
                    normalize_textarea_line_endings(value)
                } else {
                    value.to_owned()
                };
                pairs.push(FormField {
                    name: control.name.clone(),
                    value,
                });
            }
        }
    }

    encode_form_fields(&pairs, encoding_label)
}

fn normalize_textarea_line_endings(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\r\n")
}

fn encode_form_fields(fields: &[FormField], encoding_label: &str) -> Result<Vec<u8>, String> {
    let mut pairs = Vec::with_capacity(fields.len());
    for field in fields {
        let name = encode_form_component(&field.name, encoding_label)?;
        let value = encode_form_component(&field.value, encoding_label)?;
        pairs.push(format!("{name}={value}"));
    }
    Ok(pairs.join("&").into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_follow_form_and_ignores_commented_controls() {
        let html = r#"
            <form method="post" action="/bbs.cgi">
              <input type="hidden" name="m" value="p">
              <input type="hidden" name="f" value="123:2026/08/25(火)12時00分00秒">
              <input type="hidden" name="pc" value="REAL_PROTECT_CODE">
              <!-- <input type="hidden" name="pc" value="FAKE_PROTECT_CODE_1"> -->
              <!-- <input type="hidden" name="pc" value="FAKE_PROTECT_CODE_2"> -->
              <!-- <input type="hidden" name="evil" value="DO_NOT_SEND"> -->
              <input type="text" name="u" value="名無し">
              <input type="text" name="t" value="＞　">
              <textarea name="v">&gt; 引用\n\n返信</textarea>
              <!-- <textarea name="commented_body">DO_NOT_SEND</textarea> -->
              <input type="submit" name="post" value="投稿／リロード">
              <input type="submit" name="preview" value="プレビュー">
              <input type="submit" name="midokureload" value="未読">
              <!-- <input type="submit" name="commented_submit" value="投稿"> -->
            </form>
        "#;

        let form = parse_post_form(html, "https://example.test/cgi-bin/bbs.cgi?m=f&s=123")
            .unwrap()
            .unwrap();
        let names: Vec<_> = form
            .controls
            .iter()
            .map(|control| control.name.as_str())
            .collect();
        assert!(names.contains(&"m"));
        assert!(names.contains(&"f"));
        assert_eq!(names.iter().filter(|name| **name == "pc").count(), 1);
        assert_eq!(
            form.controls
                .iter()
                .find(|control| control.name == "pc")
                .unwrap()
                .value,
            "REAL_PROTECT_CODE"
        );
        assert!(names.contains(&"u"));
        assert!(names.contains(&"t"));
        assert!(names.contains(&"v"));
        assert!(names.contains(&"post"));
        assert!(!names.contains(&"evil"));
        assert!(!names.contains(&"commented_body"));
        assert!(!names.contains(&"preview"));
        assert!(!names.contains(&"midokureload"));
        assert!(!names.contains(&"commented_submit"));
    }

    #[test]
    fn does_not_accept_form_whose_only_post_button_is_commented_out() {
        let html = r#"
            <form method="post" action="/bbs.cgi">
              <textarea name="v">本文</textarea>
              <!-- <input type="submit" name="post" value="投稿"> -->
              <input type="submit" name="preview" value="プレビュー">
            </form>
        "#;
        assert!(parse_post_form(html, "https://example.test/bbs.cgi")
            .unwrap()
            .is_none());
    }

    #[test]
    fn accepts_hybrid_post_unread_submit_but_rejects_unread_only_submit() {
        assert!(score_post_submit("meload", "投稿／未読") > 0);
        assert!(score_post_submit("meload", "未読") < 0);
        assert!(score_post_submit("midokureload", "未読リロード") < 0);
    }

    #[test]
    fn normalizes_the_five_user_fields_and_hides_okome_shortcut_labels() {
        let html = r##"
            <form method="post" action="/bbs.cgi">
              <input type="hidden" name="m" value="p">
              <input type="text" name="u" value="名無し" placeholder="#ﾄﾘｯﾌﾟ使えます Alt(+Shift)+1">
              <input type="text" name="i" value="" title="Alt(+Shift)+2">
              <input type="text" name="t" value="" aria-label="Alt(+Shift)+3">
              <textarea name="v" placeholder="Alt(+Shift)+4">本文</textarea>
              <input type="text" name="l" value="https://example.test/" placeholder="Alt(+Shift)+5">
              <input type="text" name="d" value="補助値" title="Alt(+Shift)+6">
              <input type="checkbox" name="a" value="checked" checked>
              <input type="submit" name="post" value="投稿">
            </form>
        "##;

        let form = parse_post_form(html, "https://example.test/bbs.cgi")
            .unwrap()
            .unwrap();
        let expected = [
            ("u", Some("author"), "投稿者"),
            ("i", Some("email"), "メール"),
            ("t", Some("subject"), "題名"),
            ("v", Some("body"), "内容"),
            ("l", Some("url"), "URL"),
            ("d", None, "d"),
            ("a", None, "a"),
        ];

        for (name, user_field, label) in expected {
            let control = form
                .controls
                .iter()
                .find(|control| control.name == name)
                .unwrap();
            assert_eq!(control.user_field.as_deref(), user_field);
            assert_eq!(control.label, label);
        }

        for control in &form.controls {
            assert!(!control.label.contains("Alt(+Shift)"));
            assert!(!control.label.contains("#ﾄﾘｯﾌﾟ使えます"));
        }
    }

    #[test]
    fn encodes_only_the_five_user_field_overrides_and_preserves_other_form_values() {
        let html = r#"
            <form method="post" action="/bbs.cgi">
              <input type="hidden" name="m" value="p">
              <input type="text" name="u" value="名無し">
              <textarea name="v">引用</textarea>
              <input type="text" name="d" value="fixed-d">
              <input type="checkbox" name="a" value="checked" checked>
              <input type="submit" name="post" value="投稿">
              <input type="submit" name="preview" value="プレビュー">
            </form>
        "#;
        let form = parse_post_form(html, "https://example.test/bbs.cgi?m=f")
            .unwrap()
            .unwrap();
        let user = form
            .controls
            .iter()
            .find(|control| control.name == "u")
            .unwrap();
        let body = form
            .controls
            .iter()
            .find(|control| control.name == "v")
            .unwrap();
        let excluded = form
            .controls
            .iter()
            .find(|control| control.name == "d")
            .unwrap();
        let inputs = vec![
            BbsPostFormInput {
                id: user.id.clone(),
                value: "しば".into(),
                checked: false,
            },
            BbsPostFormInput {
                id: body.id.clone(),
                value: "返信".into(),
                checked: false,
            },
        ];
        let encoded =
            String::from_utf8(encode_post_form(&form, &inputs, "utf-8").unwrap()).unwrap();
        assert!(encoded.contains("m=p"));
        assert!(encoded.contains("u=%E3%81%97%E3%81%B0"));
        assert!(encoded.contains("v=%E8%BF%94%E4%BF%A1"));
        assert!(encoded.contains("d=fixed-d"));
        assert!(encoded.contains("a=checked"));
        assert!(encoded.contains("post=%E6%8A%95%E7%A8%BF"));
        assert!(!encoded.contains("preview"));

        let error = encode_post_form(
            &form,
            &[BbsPostFormInput {
                id: excluded.id.clone(),
                value: "tampered".into(),
                checked: false,
            }],
            "utf-8",
        )
        .unwrap_err();
        assert!(error.contains("編集できない"));
        assert!(error.contains("d"));
    }
}
