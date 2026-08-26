use encoding_rs::Encoding;

fn encoding_label_for_validation(encoding_label: &str) -> &str {
    if encoding_label.trim().eq_ignore_ascii_case("shift_jis") {
        "windows-31j"
    } else {
        encoding_label
    }
}

/// 指定された文字コードへ変換できない可能性がある文字を、出現順のまま返す。
/// UTF-8はすべてのUnicode文字を表現できるため、常に空文字列となる。
pub fn find_non_encodable_characters(value: &str, encoding_label: &str) -> Result<String, String> {
    let encoding_label = encoding_label_for_validation(encoding_label);
    let encoding = Encoding::for_label(encoding_label.as_bytes())
        .ok_or_else(|| format!("未対応の文字コードです: {encoding_label}"))?;

    if encoding == encoding_rs::UTF_8 {
        return Ok(String::new());
    }

    let mut invalid = String::new();
    for character in value.chars() {
        let (_, _, had_errors) = encoding.encode(&character.to_string());
        if had_errors {
            invalid.push(character);
        }
    }

    Ok(invalid)
}

pub fn decode_html(bytes: &[u8], encoding_label: &str) -> Result<String, String> {
    let encoding = Encoding::for_label(encoding_label.as_bytes())
        .ok_or_else(|| format!("未対応の文字コードです: {encoding_label}"))?;

    let (decoded, _actual_encoding, had_errors) = encoding.decode(bytes);
    if had_errors {
        eprintln!("warning: {encoding_label} のHTMLデコード中に置換文字が発生しました");
    }

    Ok(decoded.into_owned())
}

/// application/x-www-form-urlencoded 用。
/// 値を先に掲示板の文字コードへ変換してから、1 byteずつ percent-encode する。
pub fn encode_form_component(value: &str, encoding_label: &str) -> Result<String, String> {
    let encoding = Encoding::for_label(encoding_label.as_bytes())
        .ok_or_else(|| format!("未対応の文字コードです: {encoding_label}"))?;

    let (encoded, _actual_encoding, had_errors) = encoding.encode(value);
    if had_errors {
        return Err(format!(
            "{encoding_label} に変換できない文字がフォーム値に含まれています: {value:?}"
        ));
    }

    let mut out = String::with_capacity(encoded.len() * 3);
    for byte in encoded.iter().copied() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'*' => {
                out.push(byte as char)
            }
            b' ' => out.push('+'),
            _ => {
                use std::fmt::Write;
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{encoding_label_for_validation, find_non_encodable_characters};

    #[test]
    fn checks_shift_jis_settings_as_cp932() {
        assert_eq!(encoding_label_for_validation("shift_jis"), "windows-31j");
        assert_eq!(encoding_label_for_validation("Shift_JIS"), "windows-31j");
    }

    #[test]
    fn finds_only_characters_that_cannot_be_encoded_for_shift_jis() {
        let invalid = find_non_encodable_characters("A①B😀①", "shift_jis")
            .expect("shift_jis should be supported");

        assert_eq!(invalid, "😀");
    }

    #[test]
    fn utf8_never_reports_characters() {
        let invalid =
            find_non_encodable_characters("①😀", "utf-8").expect("utf-8 should be supported");

        assert!(invalid.is_empty());
    }
}
