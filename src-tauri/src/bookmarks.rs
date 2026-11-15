use serde::{Deserialize, Serialize};
use std::{fs, io::ErrorKind, path::Path};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Bookmark {
    title: String,
    url: String,
}

#[derive(Deserialize, Serialize)]
struct BookmarkConfig {
    bookmarks: Option<Vec<Bookmark>>,
}

pub fn validate(bookmarks: &[Bookmark]) -> Result<(), String> {
    for bookmark in bookmarks {
        if bookmark.title.trim().is_empty() {
            return Err("ブックマークのタイトルを入力してください。".into());
        }
        let url = reqwest::Url::parse(&bookmark.url)
            .map_err(|_| "ブックマークのURLが不正です。".to_string())?;
        if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
            return Err("ブックマークのURLはHTTP(S)で指定してください。".into());
        }
    }
    Ok(())
}

pub fn load(path: &Path) -> Result<Option<Vec<Bookmark>>, String> {
    let source = match fs::read_to_string(path) {
        Ok(source) => source,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "{} の読み込みに失敗しました: {error}",
                path.display()
            ))
        }
    };
    let config: BookmarkConfig = toml::from_str(&source)
        .map_err(|error| format!("{} の解析に失敗しました: {error}", path.display()))?;
    if let Some(entries) = &config.bookmarks {
        validate(entries)?;
    }
    Ok(config.bookmarks)
}

pub fn save(path: &Path, bookmarks: Vec<Bookmark>) -> Result<(), String> {
    validate(&bookmarks)?;
    let current = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut value: toml::Value = toml::from_str(&current).map_err(|error| error.to_string())?;
    value
        .as_table_mut()
        .ok_or("設定ファイルが不正です")?
        .insert(
            "bookmarks".into(),
            toml::Value::try_from(bookmarks).map_err(|error| error.to_string())?,
        );
    let source = toml::to_string_pretty(&value)
        .map_err(|error| format!("ブックマークの変換に失敗しました: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, source).map_err(|error| format!("global.toml の保存に失敗しました: {error}"))
}

pub fn ensure_defaults(path: &Path) -> Result<(), String> {
    if load(path)?.is_some() {
        return Ok(());
    }
    let bundled: BookmarkConfig = toml::from_str(include_str!("../resources/global.toml"))
        .map_err(|error| format!("初期ブックマークの解析に失敗しました: {error}"))?;
    save(
        path,
        bundled.bookmarks.ok_or("初期ブックマークがありません")?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_bookmarks_get_defaults_but_existing_and_empty_lists_are_preserved() {
        let path = std::env::temp_dir().join(format!(
            "midoku-bookmark-defaults-{}.toml",
            std::process::id()
        ));
        fs::write(&path, "config_version = 6\n[global]\nmax_posts = 123\n").unwrap();
        ensure_defaults(&path).unwrap();
        let entries = load(&path).unwrap().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].title, "未読菩薩");
        assert_eq!(entries[0].url, "https://github.com/kuhaku/midoku-bosatsu");
        let value: toml::Value = toml::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(value["global"]["max_posts"].as_integer(), Some(123));
        let before = fs::read_to_string(&path).unwrap();
        ensure_defaults(&path).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), before);
        save(&path, vec![]).unwrap();
        ensure_defaults(&path).unwrap();
        assert_eq!(load(&path).unwrap(), Some(vec![]));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn config_round_trip_and_empty_list() {
        let path =
            std::env::temp_dir().join(format!("midoku-bookmarks-{}.toml", std::process::id()));
        let _ = fs::remove_file(&path);
        assert_eq!(load(&path).unwrap(), None);
        fs::write(&path, "config_version = 6\n[global]\nmax_posts = 666\n").unwrap();
        assert_eq!(load(&path).unwrap(), None);
        let entries = vec![Bookmark {
            title: "掲示板\"と改行\n".into(),
            url: "https://example.com/?a=1&b=2".into(),
        }];
        save(&path, entries.clone()).unwrap();
        let value: toml::Value = toml::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(value["global"]["max_posts"].as_integer(), Some(666));
        assert_eq!(load(&path).unwrap(), Some(entries));
        assert!(fs::read_to_string(&path).unwrap().contains("[[bookmarks]]"));
        let before = fs::read_to_string(&path).unwrap();
        assert!(save(
            &path,
            vec![Bookmark {
                title: "不正".into(),
                url: "javascript:alert(1)".into()
            }]
        )
        .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), before);
        save(&path, vec![]).unwrap();
        assert_eq!(load(&path).unwrap(), Some(vec![]));
        fs::write(&path, "invalid = [").unwrap();
        assert!(load(&path).is_err());
        fs::remove_file(path).unwrap();
    }
}
