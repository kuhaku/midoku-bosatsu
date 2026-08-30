use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, AppHandle, Manager};

const GLOBAL_FILE: &str = "global.toml";
const BBS_FILE: &str = "bbs.toml";
const STYLE_FILE: &str = "reader-style.css";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderConfig {
    pub global: GlobalConfig,
    pub sites: Vec<SiteConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
    pub poll_interval_seconds: u64,
    pub max_posts: usize,
    #[serde(default = "default_post_order")]
    pub post_order: String,
    #[serde(default = "default_show_post_images")]
    pub show_post_images: bool,
    #[serde(default = "default_show_image_detail_link")]
    pub show_image_detail_link: bool,
    #[serde(default = "default_max_image_height_px")]
    pub max_image_height_px: u16,
    #[serde(default = "default_image_hover_window_percent")]
    pub image_hover_window_percent: u8,
    #[serde(default = "default_true")]
    pub keyboard_shortcuts_enabled: bool,
    #[serde(default)]
    pub viewing_mode_enabled: bool,
    #[serde(default = "default_viewing_mode_interval_seconds")]
    pub viewing_mode_interval_seconds: u64,
    /// 「参考」リンクとスレッドIDから投稿の親子関係を組み立てて表示する。
    #[serde(default)]
    pub tree_view_enabled: bool,
    #[serde(default = "default_true")]
    pub post_saving_enabled: bool,
    #[serde(default)]
    pub hide_tree_link: bool,
    #[serde(default)]
    pub hide_thread_hide_link: bool,
    #[serde(default)]
    pub expand_numeric_character_references: bool,
    #[serde(default)]
    pub ng_handle_patterns: String,
    #[serde(default)]
    pub ng_body_patterns: String,
    #[serde(default)]
    pub highlight_handle_patterns: String,
    #[serde(default)]
    pub highlight_body_patterns: String,
    #[serde(default)]
    pub reply_notification_enabled: bool,
    #[serde(default)]
    pub reply_notification_sound_enabled: bool,
    #[serde(default = "default_reply_notification_sound_kind")]
    pub reply_notification_sound_kind: String,
    #[serde(default)]
    pub reply_notification_sound_custom_name: String,
    #[serde(default)]
    pub reply_notification_include_descendants: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GlobalFileConfig {
    #[serde(default = "default_config_version")]
    config_version: u32,
    global: GlobalConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BbsFileConfig {
    #[serde(default = "default_config_version")]
    config_version: u32,
    sites: Vec<SiteConfig>,
}

#[derive(Debug, Clone)]
struct ConfigPaths {
    global: PathBuf,
    bbs: PathBuf,
    style: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderStyleConfig {
    // アプリの操作UI用フォント
    pub system_font_family: String,
    pub system_font_size_px: u16,

    // 投稿タイムライン用フォント
    pub post_font_family: String,
    pub post_font_size_px: u16,

    // 投稿表示の基本色
    pub post_background_color: String,
    pub post_text_color: String,
    pub post_quote_color: String,
    pub link_unvisited_color: String,
    pub link_hover_color: String,
    pub link_visited_color: String,
    pub post_author_color: String,
    pub post_subject_color: String,
    pub unread_post_background_color: String,
    pub unread_badge_text_color: String,
    pub unread_badge_background_color: String,

    // 投稿表示の補助色
    pub post_date_color: String,
    pub post_border_color: String,
    pub unread_accent_color: String,

    pub highlight_text_color: String,
    pub highlight_background_color: String,
    pub current_post_border_color: String,
    pub tree_header_background_color: String,
    pub tree_read_post_text_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BbsBadgeStyleConfig {
    #[serde(default = "default_bbs_badge_text_color")]
    pub text_color: String,
    #[serde(default = "default_bbs_badge_background_color")]
    pub background_color: String,
    #[serde(default = "default_bbs_badge_border_color")]
    pub border_color: String,
}

impl Default for BbsBadgeStyleConfig {
    fn default() -> Self {
        Self {
            text_color: default_bbs_badge_text_color(),
            background_color: default_bbs_badge_background_color(),
            border_color: default_bbs_badge_border_color(),
        }
    }
}

fn default_bbs_badge_text_color() -> String {
    "#eefafa".to_string()
}
fn default_bbs_badge_background_color() -> String {
    "#0b5555".to_string()
}
fn default_bbs_badge_border_color() -> String {
    "#2f6262".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteConfig {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub encoding: String,
    pub user_agent: String,
    #[serde(default = "default_timezone_offset_minutes")]
    pub timezone_offset_minutes: i32,
    #[serde(default)]
    pub timezone_region: String,
    #[serde(default)]
    pub badge_style: BbsBadgeStyleConfig,
    pub fetch: FetchConfig,
    pub post_parser: PostParserConfig,
    pub reload_form: ReloadFormConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchConfig {
    pub url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PostParserConfig {
    pub mode: String,

    // legacy_anchor_siblings 用
    #[serde(default)]
    pub anchor_selector: String,
    #[serde(default)]
    pub id_attribute: String,
    #[serde(default)]
    pub header_tag: String,
    #[serde(default)]
    pub name_tag: String,
    #[serde(default)]
    pub info_tag: String,
    #[serde(default)]
    pub body_container_tag: String,
    #[serde(default)]
    pub body_tag: String,

    // css_post 用
    #[serde(default)]
    pub post_selector: String,
    #[serde(default)]
    pub post_id_attribute: String,
    #[serde(default)]
    pub post_id_prefix: String,
    #[serde(default)]
    pub title_selector: String,
    #[serde(default)]
    pub name_selector: String,
    #[serde(default)]
    pub date_selector: String,
    #[serde(default)]
    pub body_selector: String,

    #[serde(default)]
    pub date_prefix: String,
    pub timestamp_regex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReloadFormConfig {
    pub form_selector: String,
    pub submit_input_name: String,
    #[serde(default)]
    pub submit_input_name_fallbacks: Vec<String>,
    #[serde(default)]
    pub submit_value_regex: String,
    #[serde(default = "default_post_method")]
    pub method: String,
    pub referer: String,
    #[serde(default = "default_true")]
    pub include_hidden: bool,
}

fn default_true() -> bool {
    true
}
fn default_config_version() -> u32 {
    1
}
fn default_post_order() -> String {
    "newest_first".to_owned()
}
fn default_show_post_images() -> bool {
    true
}
fn default_show_image_detail_link() -> bool {
    true
}
fn default_viewing_mode_interval_seconds() -> u64 {
    5
}
fn default_max_image_height_px() -> u16 {
    40
}
fn default_image_hover_window_percent() -> u8 {
    90
}
fn default_timezone_offset_minutes() -> i32 {
    9 * 60
}
fn default_post_method() -> String {
    "POST".to_owned()
}
fn default_reply_notification_sound_kind() -> String {
    "default".to_owned()
}

fn bundled_config_path(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
    let resource_path = format!("resources/{filename}");
    let resolved = app
        .path()
        .resolve(&resource_path, BaseDirectory::Resource)
        .map_err(|e| format!("bundled {filename} のパス解決に失敗しました: {e}"))?;

    if resolved.exists() {
        return Ok(resolved);
    }

    // tauri dev でresourceのコピー前に呼ばれる環境向けfallback。
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(filename);
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err(format!(
        "bundled {filename} が見つかりません: {}",
        resolved.display()
    ))
}

fn user_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("アプリ設定ディレクトリの取得に失敗しました: {e}"))
}

fn read_toml_value(path: &Path) -> Result<toml::Value, String> {
    let source = fs::read_to_string(path)
        .map_err(|e| format!("{} の読み込みに失敗しました: {e}", path.display()))?;
    toml::from_str(&source).map_err(|e| format!("{} のTOML解析に失敗しました: {e}", path.display()))
}

fn write_toml_value(path: &Path, value: &toml::Value) -> Result<(), String> {
    let serialized = toml::to_string_pretty(value)
        .map_err(|e| format!("{} のTOML出力に失敗しました: {e}", path.display()))?;
    fs::write(path, serialized).map_err(|e| format!("{} の更新に失敗しました: {e}", path.display()))
}

fn config_path_for_kind<'a>(paths: &'a ConfigPaths, file_name: &str) -> Result<&'a Path, String> {
    match file_name {
        GLOBAL_FILE => Ok(&paths.global),
        BBS_FILE => Ok(&paths.bbs),
        other => Err(format!(
            "インポート対象は global.toml または bbs.toml のみです: {other}"
        )),
    }
}

pub(crate) fn validate_import_source(file_name: &str, source: &str) -> Result<(), String> {
    match file_name {
        GLOBAL_FILE => {
            let file: GlobalFileConfig = toml::from_str(source)
                .map_err(|e| format!("global.toml のTOML解析に失敗しました: {e}"))?;
            validate_global_config(&file.global)
        }
        BBS_FILE => {
            let file: BbsFileConfig = toml::from_str(source)
                .map_err(|e| format!("bbs.toml のTOML解析に失敗しました: {e}"))?;
            let mut seen_ids = std::collections::HashSet::new();
            for site in &file.sites {
                validate_site_config(site, &mut seen_ids)?;
            }
            Ok(())
        }
        other => Err(format!(
            "インポート対象は global.toml または bbs.toml のみです: {other}"
        )),
    }
}

pub fn export_config_file(
    app: &AppHandle,
    file_name: &str,
    destination: &Path,
) -> Result<(), String> {
    let paths = ensure_user_config_paths(app)?;
    let source = config_path_for_kind(&paths, file_name)?;
    fs::copy(source, destination).map_err(|e| {
        format!(
            "{} のエクスポートに失敗しました ({}): {e}",
            file_name,
            destination.display()
        )
    })?;
    Ok(())
}

pub fn import_config_file(
    app: &AppHandle,
    file_name: &str,
    source_path: &Path,
) -> Result<(), String> {
    let paths = ensure_user_config_paths(app)?;
    let target = config_path_for_kind(&paths, file_name)?;
    let source = fs::read_to_string(source_path).map_err(|e| {
        format!(
            "{} の読み込みに失敗しました ({}): {e}",
            file_name,
            source_path.display()
        )
    })?;
    validate_import_source(file_name, &source)?;
    fs::write(target, source).map_err(|e| {
        format!(
            "{} のインポートに失敗しました ({}): {e}",
            file_name,
            target.display()
        )
    })
}

fn reset_config_from_source(file_name: &str, source: &str, target: &Path) -> Result<(), String> {
    validate_import_source(file_name, source)?;
    fs::write(target, source).map_err(|e| {
        format!(
            "{} のリセットに失敗しました ({}): {e}",
            file_name,
            target.display()
        )
    })
}

pub fn reset_config_to_bundled(app: &AppHandle, file_name: &str) -> Result<(), String> {
    let paths = ensure_user_config_paths(app)?;
    let target = config_path_for_kind(&paths, file_name)?;
    let bundled = bundled_config_path(app, file_name)?;
    let source = fs::read_to_string(&bundled).map_err(|e| {
        format!(
            "bundled {} の読み込みに失敗しました ({}): {e}",
            file_name,
            bundled.display()
        )
    })?;
    reset_config_from_source(file_name, &source, target)
}

fn copy_bundled_if_missing(app: &AppHandle, filename: &str, target: &Path) -> Result<(), String> {
    if target.exists() {
        return Ok(());
    }
    let bundled = bundled_config_path(app, filename)?;
    fs::copy(&bundled, target).map_err(|e| {
        format!(
            "{filename} の初期コピーに失敗しました ({} -> {}): {e}",
            bundled.display(),
            target.display()
        )
    })?;
    Ok(())
}

fn migrate_global_value(user: &mut toml::Value, bundled: &toml::Value) -> Result<bool, String> {
    let bundled_version = bundled
        .get("config_version")
        .and_then(toml::Value::as_integer)
        .unwrap_or(1);
    let user_version = user
        .get("config_version")
        .and_then(toml::Value::as_integer)
        .unwrap_or(1);
    if user_version >= bundled_version {
        return Ok(false);
    }

    let bundled_global = bundled
        .get("global")
        .and_then(toml::Value::as_table)
        .cloned()
        .unwrap_or_default();
    let user_table = user
        .as_table_mut()
        .ok_or_else(|| "ユーザー global.toml のルートがtableではありません".to_string())?;
    let user_global = user_table
        .entry("global".to_string())
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()))
        .as_table_mut()
        .ok_or_else(|| "ユーザー global.toml の global がtableではありません".to_string())?;

    if user_version < 3 && !user_global.contains_key("reply_notification_enabled") {
        let legacy_enabled = user_global
            .get("reply_notification_sound_enabled")
            .and_then(toml::Value::as_bool)
            .unwrap_or(false);
        user_global.insert(
            "reply_notification_enabled".to_string(),
            toml::Value::Boolean(legacy_enabled),
        );
    }

    for (key, value) in bundled_global {
        user_global.entry(key).or_insert(value);
    }
    user_table.insert(
        "config_version".to_string(),
        toml::Value::Integer(bundled_version),
    );
    Ok(true)
}

fn migrate_global_if_needed(app: &AppHandle, target: &Path) -> Result<(), String> {
    let bundled_path = bundled_config_path(app, GLOBAL_FILE)?;
    let bundled = read_toml_value(&bundled_path)?;
    let mut user = read_toml_value(target)?;
    if migrate_global_value(&mut user, &bundled)? {
        write_toml_value(target, &user)?;
    }
    Ok(())
}

fn migrate_bbs_if_needed(app: &AppHandle, target: &Path) -> Result<(), String> {
    let bundled_path = bundled_config_path(app, BBS_FILE)?;
    let bundled = read_toml_value(&bundled_path)?;
    let mut user = read_toml_value(target)?;

    let bundled_version = bundled
        .get("config_version")
        .and_then(toml::Value::as_integer)
        .unwrap_or(1);
    let user_version = user
        .get("config_version")
        .and_then(toml::Value::as_integer)
        .unwrap_or(1);
    if user_version >= bundled_version {
        return Ok(());
    }

    let bundled_sites = bundled
        .get("sites")
        .and_then(toml::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let user_table = user
        .as_table_mut()
        .ok_or_else(|| "ユーザー bbs.toml のルートがtableではありません".to_string())?;
    let user_sites = user_table
        .entry("sites".to_string())
        .or_insert_with(|| toml::Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| "ユーザー bbs.toml の sites が配列ではありません".to_string())?;

    for bundled_site in bundled_sites {
        let Some(bundled_id) = bundled_site.get("id").and_then(toml::Value::as_str) else {
            continue;
        };
        let exists = user_sites.iter().any(|site| {
            site.get("id")
                .and_then(toml::Value::as_str)
                .is_some_and(|id| id == bundled_id)
        });
        if !exists {
            user_sites.push(bundled_site);
        }
    }

    user_table.insert(
        "config_version".to_string(),
        toml::Value::Integer(bundled_version),
    );
    write_toml_value(target, &user)
}

fn ensure_user_config_paths(app: &AppHandle) -> Result<ConfigPaths, String> {
    let dir = user_config_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("設定ディレクトリの作成に失敗しました: {e}"))?;

    let global_path = dir.join(GLOBAL_FILE);
    let bbs_path = dir.join(BBS_FILE);
    let style_path = dir.join(STYLE_FILE);

    copy_bundled_if_missing(app, GLOBAL_FILE, &global_path)?;
    copy_bundled_if_missing(app, BBS_FILE, &bbs_path)?;
    copy_bundled_if_missing(app, STYLE_FILE, &style_path)?;
    migrate_global_if_needed(app, &global_path)?;
    migrate_bbs_if_needed(app, &bbs_path)?;

    Ok(ConfigPaths {
        global: global_path,
        bbs: bbs_path,
        style: style_path,
    })
}

pub(crate) fn ensure_user_configs(app: &AppHandle) -> Result<(), String> {
    ensure_user_config_paths(app).map(|_| ())
}

pub fn load_reader_config(app: &AppHandle) -> Result<ReaderConfig, String> {
    let paths = ensure_user_config_paths(app)?;

    let global_source = fs::read_to_string(&paths.global)
        .map_err(|e| format!("{} の読み込みに失敗しました: {e}", paths.global.display()))?;
    let bbs_source = fs::read_to_string(&paths.bbs)
        .map_err(|e| format!("{} の読み込みに失敗しました: {e}", paths.bbs.display()))?;

    let global_file: GlobalFileConfig = toml::from_str(&global_source)
        .map_err(|e| format!("{} のTOML解析に失敗しました: {e}", paths.global.display()))?;
    let bbs_file: BbsFileConfig = toml::from_str(&bbs_source)
        .map_err(|e| format!("{} のTOML解析に失敗しました: {e}", paths.bbs.display()))?;

    Ok(ReaderConfig {
        global: global_file.global,
        sites: bbs_file.sites,
    })
}

fn validate_site_config(
    site: &SiteConfig,
    seen_ids: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let id = site.id.trim();
    if id.is_empty() {
        return Err("BBS IDが空です".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err(format!("BBS IDには英数字・-・_のみ使用できます: {id}"));
    }
    if !seen_ids.insert(id.to_string()) {
        return Err(format!("BBS IDが重複しています: {id}"));
    }
    if site.name.trim().is_empty() {
        return Err(format!("{id}: 表示名が空です"));
    }
    if encoding_rs::Encoding::for_label(site.encoding.trim().as_bytes()).is_none() {
        return Err(format!("{id}: 未対応の文字コードです: {}", site.encoding));
    }
    if site.user_agent.trim().is_empty() {
        return Err(format!("{id}: User-Agentが空です"));
    }
    if !(-24 * 60..=24 * 60).contains(&site.timezone_offset_minutes) {
        return Err(format!("{id}: timezone_offset_minutes の範囲が不正です"));
    }

    let fetch_url = reqwest::Url::parse(site.fetch.url.trim())
        .map_err(|e| format!("{id}: 取得先URLが不正です: {e}"))?;
    if !matches!(fetch_url.scheme(), "http" | "https") {
        return Err(format!("{id}: 取得先URLはHTTP/HTTPSのみ指定できます"));
    }

    regex::Regex::new(&site.post_parser.timestamp_regex)
        .map_err(|e| format!("{id}: timestamp_regex が不正です: {e}"))?;

    for (label, color) in [
        ("BBS名バッジの文字色", &site.badge_style.text_color),
        ("BBS名バッジの背景色", &site.badge_style.background_color),
        ("BBS名バッジの枠色", &site.badge_style.border_color),
    ] {
        validate_hex_color(label, color).map_err(|e| format!("{id}: {e}"))?;
    }

    match site.post_parser.mode.as_str() {
        "legacy_anchor_siblings" => {
            for (label, value) in [
                ("anchor_selector", &site.post_parser.anchor_selector),
                ("id_attribute", &site.post_parser.id_attribute),
                ("header_tag", &site.post_parser.header_tag),
                ("name_tag", &site.post_parser.name_tag),
                ("info_tag", &site.post_parser.info_tag),
                ("body_container_tag", &site.post_parser.body_container_tag),
                ("body_tag", &site.post_parser.body_tag),
            ] {
                if value.trim().is_empty() {
                    return Err(format!("{id}: {label} が空です"));
                }
            }
        }
        "css_post" => {
            for (label, value) in [
                ("post_selector", &site.post_parser.post_selector),
                ("post_id_attribute", &site.post_parser.post_id_attribute),
                ("date_selector", &site.post_parser.date_selector),
                ("body_selector", &site.post_parser.body_selector),
            ] {
                if value.trim().is_empty() {
                    return Err(format!("{id}: {label} が空です"));
                }
            }
        }
        other => return Err(format!("{id}: 未対応のpost_parser.modeです: {other}")),
    }

    if site.reload_form.form_selector.trim().is_empty() {
        return Err(format!("{id}: reload_form.form_selector が空です"));
    }
    if site.reload_form.submit_input_name.trim().is_empty()
        && site.reload_form.submit_input_name_fallbacks.is_empty()
        && site.reload_form.submit_value_regex.trim().is_empty()
    {
        return Err(format!("{id}: 未読リロード用submitの判定条件がありません"));
    }
    if !site.reload_form.method.eq_ignore_ascii_case("POST") {
        return Err(format!("{id}: 未読リロードmethodはPOSTのみ対応しています"));
    }
    if !site.reload_form.submit_value_regex.trim().is_empty() {
        regex::Regex::new(&site.reload_form.submit_value_regex)
            .map_err(|e| format!("{id}: submit_value_regex が不正です: {e}"))?;
    }
    let referer = reqwest::Url::parse(site.reload_form.referer.trim())
        .map_err(|e| format!("{id}: Referer URLが不正です: {e}"))?;
    if !matches!(referer.scheme(), "http" | "https") {
        return Err(format!("{id}: RefererはHTTP/HTTPSのみ指定できます"));
    }

    Ok(())
}

pub fn save_bbs_sites(app: &AppHandle, sites: Vec<SiteConfig>) -> Result<(), String> {
    let paths = ensure_user_config_paths(app)?;
    let mut seen_ids = std::collections::HashSet::new();
    for site in &sites {
        validate_site_config(site, &mut seen_ids)?;
    }

    let current = read_toml_value(&paths.bbs)?;
    let config_version = current
        .get("config_version")
        .and_then(toml::Value::as_integer)
        .unwrap_or(1) as u32;

    let next = BbsFileConfig {
        config_version,
        sites,
    };
    let serialized = toml::to_string_pretty(&next)
        .map_err(|e| format!("bbs.toml のTOML出力に失敗しました: {e}"))?;

    fs::write(&paths.bbs, serialized)
        .map_err(|e| format!("{} の更新に失敗しました: {e}", paths.bbs.display()))?;
    Ok(())
}

pub(crate) fn validate_global_config(global: &GlobalConfig) -> Result<(), String> {
    if !(30..=86_400).contains(&global.poll_interval_seconds) {
        return Err("未読リロード間隔は30〜86400秒で指定してください".to_string());
    }
    if !(1..=100_000).contains(&global.max_posts) {
        return Err("投稿表示上限数は1〜100000件で指定してください".to_string());
    }
    if global.max_image_height_px == 0 {
        return Err("max_image_height_px は1以上にしてください".to_string());
    }
    if !(1..=100).contains(&global.image_hover_window_percent) {
        return Err("image_hover_window_percent は1〜100で指定してください".to_string());
    }
    if !(1..=86_400).contains(&global.viewing_mode_interval_seconds) {
        return Err("観賞用自動モードの表示間隔は1〜86400秒で指定してください".to_string());
    }
    match global.post_order.as_str() {
        "newest_first" | "oldest_first" => {}
        other => return Err(format!("未対応のpost_orderです: {other}")),
    }
    match global.reply_notification_sound_kind.as_str() {
        "default" | "custom" => {}
        other => {
            return Err(format!(
                "未対応のreply_notification_sound_kindです: {other}"
            ))
        }
    }
    Ok(())
}

pub fn save_global_config(app: &AppHandle, global: GlobalConfig) -> Result<(), String> {
    validate_global_config(&global)?;
    let paths = ensure_user_config_paths(app)?;
    let current = read_toml_value(&paths.global)?;
    let config_version = current
        .get("config_version")
        .and_then(toml::Value::as_integer)
        .unwrap_or(1) as u32;
    let next = GlobalFileConfig {
        config_version,
        global,
    };
    let serialized = toml::to_string_pretty(&next)
        .map_err(|e| format!("global.toml のTOML出力に失敗しました: {e}"))?;
    fs::write(&paths.global, serialized)
        .map_err(|e| format!("{} の更新に失敗しました: {e}", paths.global.display()))
}

fn css_var(source: &str, name: &str) -> Option<String> {
    let pattern = format!(r"--{}\s*:\s*([^;]+);", regex::escape(name));
    let re = regex::Regex::new(&pattern).ok()?;
    re.captures(source)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().trim().to_string())
}

fn css_px_var(source: &str, name: &str) -> Option<u16> {
    let value = css_var(source, name)?;
    value.trim_end_matches("px").trim().parse::<u16>().ok()
}

fn css_var_or(source: &str, name: &str, fallback: &str) -> String {
    css_var(source, name).unwrap_or_else(|| fallback.to_string())
}

fn parse_reader_style(source: &str) -> Result<ReaderStyleConfig, String> {
    let system_font_family = css_var(source, "system-font-family")
        .unwrap_or_else(|| "system-ui, -apple-system, BlinkMacSystemFont, Yu Gothic UI, Segoe UI, Roboto, Noto Sans JP, sans-serif".to_string());
    let system_font_size_px = css_px_var(source, "system-font-size").unwrap_or(16);
    let post_font_family = css_var(source, "post-font-family").unwrap_or_else(|| {
        "MS Gothic, BIZ UDGothic, Yu Gothic UI, ui-monospace, monospace".to_string()
    });
    let post_font_size_px = css_px_var(source, "post-font-size").unwrap_or(16);

    Ok(ReaderStyleConfig {
        system_font_family,
        system_font_size_px,
        post_font_family,
        post_font_size_px,
        post_background_color: css_var_or(source, "post-background-color", "#004040"),
        post_text_color: css_var_or(source, "post-text-color", "#ffffff"),
        post_quote_color: css_var_or(source, "post-quote-color", "#d1d1d1"),
        link_unvisited_color: css_var_or(source, "post-link-unvisited-color", "#eeffee"),
        link_hover_color: css_var_or(source, "post-link-hover-color", "#ea4335"),
        link_visited_color: css_var_or(source, "post-link-visited-color", "#dddddd"),
        post_author_color: css_var_or(source, "post-author-color", "#ffffff"),
        post_subject_color: css_var_or(source, "post-subject-color", "#ffffff"),
        unread_post_background_color: css_var_or(source, "post-unread-background-color", "#195353"),
        unread_badge_text_color: css_var_or(source, "unread-badge-text-color", "#ffffff"),
        unread_badge_background_color: css_var_or(
            source,
            "unread-badge-background-color",
            "#195353",
        ),
        post_date_color: css_var_or(source, "post-date-color", "#b9cccc"),
        post_border_color: css_var_or(source, "post-border-color", "#2f6262"),
        unread_accent_color: css_var_or(source, "unread-accent-color", "#b9dddd"),
        highlight_text_color: css_var_or(source, "post-highlight-text-color", "#000000"),
        highlight_background_color: css_var_or(
            source,
            "post-highlight-background-color",
            "#ffff00",
        ),
        current_post_border_color: css_var_or(source, "current-post-border-color", "#fbbc05"),
        tree_header_background_color: css_var_or(source, "tree-header-background-color", "#57763b"),
        tree_read_post_text_color: css_var_or(source, "tree-read-post-text-color", "#cacaba"),
    })
}

pub fn load_reader_style(app: &AppHandle) -> Result<ReaderStyleConfig, String> {
    let paths = ensure_user_config_paths(app)?;
    let source = fs::read_to_string(&paths.style)
        .map_err(|e| format!("{} の読み込みに失敗しました: {e}", paths.style.display()))?;
    parse_reader_style(&source)
}

fn validate_font_family(label: &str, family: &str) -> Result<(), String> {
    let family = family.trim();
    if family.is_empty() {
        return Err(format!("{label}を入力してください"));
    }
    if family
        .chars()
        .any(|c| matches!(c, ';' | '{' | '}' | '\n' | '\r'))
        || family.contains("/*")
        || family.contains("*/")
    {
        return Err(format!("{label}にCSS構文を壊す文字は使用できません"));
    }
    Ok(())
}

fn validate_hex_color(label: &str, color: &str) -> Result<(), String> {
    let re = regex::Regex::new(r"^#[0-9a-fA-F]{6}$")
        .map_err(|e| format!("色検証用正規表現の作成に失敗しました: {e}"))?;
    if !re.is_match(color.trim()) {
        return Err(format!("{label}は #RRGGBB 形式で指定してください"));
    }
    Ok(())
}

pub(crate) fn validate_reader_style(style: &ReaderStyleConfig) -> Result<(), String> {
    validate_font_family("システム用フォントファミリー", &style.system_font_family)?;
    validate_font_family("投稿表示用フォントファミリー", &style.post_font_family)?;
    if !(8..=72).contains(&style.system_font_size_px) {
        return Err("システム用フォントサイズは8〜72pxで指定してください".to_string());
    }
    if !(8..=72).contains(&style.post_font_size_px) {
        return Err("投稿表示用フォントサイズは8〜72pxで指定してください".to_string());
    }

    for (label, color) in [
        ("通常の背景色", &style.post_background_color),
        ("通常の文字色", &style.post_text_color),
        ("投稿の引用部分の文字色", &style.post_quote_color),
        ("未訪問リンクの文字色", &style.link_unvisited_color),
        ("リンクのマウスホバー時の文字色", &style.link_hover_color),
        ("訪問済みリンクの文字色", &style.link_visited_color),
        ("投稿者名の文字色", &style.post_author_color),
        ("題名の文字色", &style.post_subject_color),
        ("未読投稿の背景色", &style.unread_post_background_color),
        ("未読バッジの文字色", &style.unread_badge_text_color),
        ("未読バッジの背景色", &style.unread_badge_background_color),
        ("投稿日の文字色", &style.post_date_color),
        ("投稿区切り線の色", &style.post_border_color),
        ("未読アクセント色", &style.unread_accent_color),
        ("ハイライト文字色", &style.highlight_text_color),
        ("ハイライト背景色", &style.highlight_background_color),
        ("現在の投稿の枠色", &style.current_post_border_color),
        (
            "ツリーヘッダーの背景色",
            &style.tree_header_background_color,
        ),
        (
            "ツリー表示時の既読投稿の文字色",
            &style.tree_read_post_text_color,
        ),
    ] {
        validate_hex_color(label, color)?;
    }
    Ok(())
}

pub fn save_reader_style(app: &AppHandle, style: ReaderStyleConfig) -> Result<(), String> {
    validate_reader_style(&style)?;
    let paths = ensure_user_config_paths(app)?;
    let source = format!(
        r#"/* 未読菩薩 (Midoku Bosatsu) - 表示スタイル設定
   一般設定GUIと連動するCSSです。 */
:root {{
  --system-font-family: {};
  --system-font-size: {}px;
  --post-font-family: {};
  --post-font-size: {}px;

  --post-background-color: {};
  --post-text-color: {};
  --post-quote-color: {};
  --post-link-unvisited-color: {};
  --post-link-hover-color: {};
  --post-link-visited-color: {};
  --post-author-color: {};
  --post-subject-color: {};
  --post-unread-background-color: {};
  --unread-badge-text-color: {};
  --unread-badge-background-color: {};

  --post-date-color: {};
  --post-border-color: {};
  --unread-accent-color: {};

  --post-highlight-text-color: {};
  --post-highlight-background-color: {};
  --current-post-border-color: {};
  --tree-header-background-color: {};
  --tree-read-post-text-color: {};
}}
"#,
        style.system_font_family.trim(),
        style.system_font_size_px,
        style.post_font_family.trim(),
        style.post_font_size_px,
        style.post_background_color,
        style.post_text_color,
        style.post_quote_color,
        style.link_unvisited_color,
        style.link_hover_color,
        style.link_visited_color,
        style.post_author_color,
        style.post_subject_color,
        style.unread_post_background_color,
        style.unread_badge_text_color,
        style.unread_badge_background_color,
        style.post_date_color,
        style.post_border_color,
        style.unread_accent_color,
        style.highlight_text_color,
        style.highlight_background_color,
        style.current_post_border_color,
        style.tree_header_background_color,
        style.tree_read_post_text_color,
    );
    fs::write(&paths.style, source)
        .map_err(|e| format!("{} の更新に失敗しました: {e}", paths.style.display()))
}

pub fn find_site<'a>(config: &'a ReaderConfig, site_id: &str) -> Result<&'a SiteConfig, String> {
    config
        .sites
        .iter()
        .find(|site| site.id == site_id)
        .ok_or_else(|| format!("サイト設定が見つかりません: {site_id}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_kind_rejects_unknown_files() {
        let error = validate_import_source("unknown.toml", "").expect_err("unknown kind must fail");
        assert!(error.contains("インポート対象"));
    }

    #[test]
    fn global_import_rejects_invalid_global_settings() {
        let source = r#"
config_version = 2

[global]
poll_interval_seconds = 5
max_posts = 666
post_order = "newest_first"
"#;

        let error = validate_import_source("global.toml", source)
            .expect_err("invalid global settings must fail");
        assert!(error.contains("未読リロード間隔"));
    }

    #[test]
    fn global_import_accepts_legacy_optional_fields() {
        let source = r#"
config_version = 1

[global]
poll_interval_seconds = 90
max_posts = 666
post_order = "newest_first"
"#;

        validate_import_source("global.toml", source).expect("legacy global should be accepted");
    }

    #[test]
    fn legacy_global_defaults_to_showing_tree_action_links() {
        let source = r#"
config_version = 1

[global]
poll_interval_seconds = 90
max_posts = 666
post_order = "newest_first"
"#;

        let config: GlobalFileConfig = toml::from_str(source).expect("legacy config should parse");
        assert!(!config.global.hide_tree_link);
        assert!(!config.global.hide_thread_hide_link);
        assert!(config.global.post_saving_enabled);
    }

    #[test]
    fn global_migration_keeps_legacy_notification_enabled_state() {
        let bundled: toml::Value =
            toml::from_str(include_str!("../resources/global.toml")).unwrap();
        let mut user: toml::Value = toml::from_str(
            r#"
config_version = 2

[global]
poll_interval_seconds = 90
max_posts = 666
reply_notification_sound_enabled = true
"#,
        )
        .unwrap();

        migrate_global_value(&mut user, &bundled).unwrap();

        assert_eq!(
            user["global"]["reply_notification_enabled"].as_bool(),
            Some(true),
        );
        assert_eq!(
            user["global"]["reply_notification_sound_enabled"].as_bool(),
            Some(true),
        );
    }

    #[test]
    fn bbs_import_accepts_the_bundled_schema() {
        let source = include_str!("../resources/bbs.toml");
        validate_import_source("bbs.toml", source).expect("bundled BBS config should be accepted");
    }

    #[test]
    fn reset_config_from_source_validates_and_overwrites_the_target() {
        let target = std::env::temp_dir().join(format!(
            "midoku-bosatsu-config-reset-{}-global.toml",
            std::process::id()
        ));
        fs::write(&target, "old config").expect("test target should be writable");

        reset_config_from_source(
            GLOBAL_FILE,
            include_str!("../resources/global.toml"),
            &target,
        )
        .expect("bundled global config should reset the target");

        assert_eq!(
            fs::read_to_string(&target).expect("reset target should be readable"),
            include_str!("../resources/global.toml")
        );
        fs::remove_file(target).expect("test target should be removable");
    }
}
