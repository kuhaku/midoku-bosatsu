use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::{config::GlobalConfig, model::ParsedPost};

const STORE_VERSION: u32 = 1;
const TRACKING_TTL_HOURS: i64 = 7 * 24;
const MAX_CUSTOM_SOUND_BYTES: u64 = 20 * 1024 * 1024;
const TRACKING_DIR: &str = "reply-notifications";
const TRACKING_FILE: &str = "tracking.json";
const CUSTOM_SOUND_FILE: &str = "custom-notification-sound";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum TrackingSource {
    AutoOwn,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReplyTrackingStore {
    version: u32,
    #[serde(default)]
    tracked_roots: Vec<TrackedReplyRoot>,
}

impl Default for ReplyTrackingStore {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            tracked_roots: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TrackedReplyRoot {
    source: TrackingSource,
    site_id: String,
    #[serde(default)]
    post_id: Option<String>,
    created_at: DateTime<Utc>,
    #[serde(default)]
    pending_match: Option<PendingPostMatch>,
    #[serde(default)]
    known_tree_post_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct PendingPostMatch {
    author: String,
    email: String,
    subject: String,
    body: String,
    url: String,
    #[serde(default)]
    known_post_ids_before: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SubmittedPostFields {
    pub author: String,
    pub email: String,
    pub subject: String,
    pub body: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrackedPostRef {
    pub site_id: String,
    pub post_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrackedReplyRootRef {
    pub site_id: String,
    pub post_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReplyNotificationUiState {
    pub manual: Vec<TrackedPostRef>,
    pub automatic: Vec<TrackedPostRef>,
    #[serde(default)]
    pub error: String,
}

#[derive(Debug, Clone, Default)]
pub struct ReplyProcessOutcome {
    pub reply_detected: bool,
    pub reply_post_ids: Vec<String>,
    pub error: String,
}

pub struct ReplyNotificationService {
    base_dir: PathBuf,
    store_path: PathBuf,
    store: Mutex<ReplyTrackingStore>,
    warning: Mutex<Option<String>>,
}

impl ReplyNotificationService {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let base_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("返信通知用アプリデータディレクトリの取得に失敗しました: {e}"))?
            .join(TRACKING_DIR);
        Self::new_at_dir(base_dir)
    }

    fn new_at_dir(base_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&base_dir)
            .map_err(|e| format!("返信通知用ディレクトリの作成に失敗しました: {e}"))?;
        let store_path = base_dir.join(TRACKING_FILE);
        let (store, warning) = load_store(&store_path);
        Ok(Self {
            base_dir,
            store_path,
            store: Mutex::new(store),
            warning: Mutex::new(warning),
        })
    }

    fn lock_store(&self) -> Result<MutexGuard<'_, ReplyTrackingStore>, String> {
        self.store
            .lock()
            .map_err(|_| "返信通知追跡ストアのロックに失敗しました".to_string())
    }

    fn take_warning(&self) -> String {
        self.warning
            .lock()
            .ok()
            .and_then(|mut warning| warning.take())
            .unwrap_or_default()
    }

    pub fn ui_state(&self, now: DateTime<Utc>) -> Result<ReplyNotificationUiState, String> {
        let mut store = self.lock_store()?;
        if prune_expired(&mut store, now) {
            save_store(&self.store_path, &store)?;
        }
        let mut state = build_ui_state(&store);
        state.error = self.take_warning();
        Ok(state)
    }

    pub fn tracked_roots(&self, now: DateTime<Utc>) -> Result<Vec<TrackedReplyRootRef>, String> {
        let mut store = self.lock_store()?;
        if prune_expired(&mut store, now) {
            save_store(&self.store_path, &store)?;
        }
        Ok(store
            .tracked_roots
            .iter()
            .filter_map(|root| {
                root.post_id.as_ref().map(|post_id| TrackedReplyRootRef {
                    site_id: root.site_id.clone(),
                    post_id: post_id.clone(),
                    created_at: root.created_at,
                })
            })
            .collect())
    }

    pub fn remove_tracked_roots(
        &self,
        targets: &[TrackedPostRef],
        now: DateTime<Utc>,
    ) -> Result<(), String> {
        let mut store = self.lock_store()?;
        let mut changed = prune_expired(&mut store, now);
        let before = store.tracked_roots.len();
        store.tracked_roots.retain(|root| {
            !targets.iter().any(|target| {
                root.site_id == target.site_id && root.post_id.as_deref() == Some(&target.post_id)
            })
        });
        changed |= before != store.tracked_roots.len();
        if changed {
            save_store(&self.store_path, &store)?;
        }
        Ok(())
    }

    pub fn set_manual_tracking(
        &self,
        site_id: &str,
        post_id: &str,
        enabled: bool,
        baseline_post_ids: &[String],
        now: DateTime<Utc>,
    ) -> Result<ReplyNotificationUiState, String> {
        let site_id = site_id.trim();
        let post_id = post_id.trim();
        if site_id.is_empty() || post_id.is_empty() {
            return Err("通知対象のBBS IDまたは投稿IDが空です".to_string());
        }

        let mut store = self.lock_store()?;
        let mut changed = prune_expired(&mut store, now);
        let automatic_exists = store.tracked_roots.iter().any(|root| {
            root.source == TrackingSource::AutoOwn
                && root.site_id == site_id
                && root.post_id.as_deref() == Some(post_id)
        });

        if enabled {
            if !automatic_exists
                && !store.tracked_roots.iter().any(|root| {
                    root.source == TrackingSource::Manual
                        && root.site_id == site_id
                        && root.post_id.as_deref() == Some(post_id)
                })
            {
                let mut baseline: Vec<String> = baseline_post_ids
                    .iter()
                    .map(|id| id.trim())
                    .filter(|id| !id.is_empty() && *id != post_id)
                    .map(str::to_string)
                    .collect();
                baseline.sort();
                baseline.dedup();
                store.tracked_roots.push(TrackedReplyRoot {
                    source: TrackingSource::Manual,
                    site_id: site_id.to_string(),
                    post_id: Some(post_id.to_string()),
                    created_at: now,
                    pending_match: None,
                    known_tree_post_ids: baseline,
                });
                changed = true;
            }
        } else {
            let before = store.tracked_roots.len();
            store.tracked_roots.retain(|root| {
                !(root.source == TrackingSource::Manual
                    && root.site_id == site_id
                    && root.post_id.as_deref() == Some(post_id))
            });
            changed |= before != store.tracked_roots.len();
        }

        if changed {
            save_store(&self.store_path, &store)?;
        }
        let mut state = build_ui_state(&store);
        state.error = self.take_warning();
        Ok(state)
    }

    pub fn register_own_post_submission(
        &self,
        site_id: &str,
        submitted: SubmittedPostFields,
        known_before: &HashSet<String>,
        response_posts: &[ParsedPost],
        now: DateTime<Utc>,
    ) -> Result<(), String> {
        let site_id = site_id.trim();
        if site_id.is_empty() {
            return Err("投稿追跡のBBS IDが空です".to_string());
        }

        let pending = PendingPostMatch {
            author: normalize_field(&submitted.author),
            email: normalize_field(&submitted.email),
            subject: normalize_field(&submitted.subject),
            body: normalize_body(&submitted.body),
            url: normalize_field(&submitted.url),
            known_post_ids_before: known_before.iter().cloned().collect(),
        };
        let candidates = matching_candidates(response_posts, site_id, &pending, now);
        let resolved_post_id = (candidates.len() == 1).then(|| candidates[0].id.clone());

        let mut store = self.lock_store()?;
        let pruned = prune_expired(&mut store, now);

        if let Some(post_id) = resolved_post_id.as_deref() {
            if store.tracked_roots.iter().any(|root| {
                root.source == TrackingSource::AutoOwn
                    && root.site_id == site_id
                    && root.post_id.as_deref() == Some(post_id)
            }) {
                if pruned {
                    save_store(&self.store_path, &store)?;
                }
                return Ok(());
            }
            store.tracked_roots.retain(|root| {
                !(root.source == TrackingSource::Manual
                    && root.site_id == site_id
                    && root.post_id.as_deref() == Some(post_id))
            });
        }

        store.tracked_roots.push(TrackedReplyRoot {
            source: TrackingSource::AutoOwn,
            site_id: site_id.to_string(),
            post_id: resolved_post_id,
            created_at: now,
            pending_match: if candidates.len() == 1 {
                None
            } else {
                Some(pending)
            },
            known_tree_post_ids: Vec::new(),
        });
        save_store(&self.store_path, &store)
    }

    pub fn process_posts(
        &self,
        site_id: &str,
        posts: &[ParsedPost],
        include_descendants: bool,
        now: DateTime<Utc>,
    ) -> Result<ReplyProcessOutcome, String> {
        let mut store = self.lock_store()?;
        let mut changed = prune_expired(&mut store, now);
        changed |= resolve_pending_own_posts(&mut store, site_id, posts, now);
        changed |= dedupe_resolved_auto_roots(&mut store);

        let own_post_ids: HashSet<String> = store
            .tracked_roots
            .iter()
            .filter(|root| root.source == TrackingSource::AutoOwn && root.site_id == site_id)
            .filter_map(|root| root.post_id.clone())
            .collect();

        let mut reply_detected = false;
        let mut reply_post_ids = Vec::new();
        let mut detected_post_ids = HashSet::new();
        for root in store
            .tracked_roots
            .iter_mut()
            .filter(|root| root.site_id == site_id)
        {
            let Some(root_post_id) = root.post_id.clone() else {
                continue;
            };

            let mut ancestors: HashSet<String> = root.known_tree_post_ids.iter().cloned().collect();
            ancestors.insert(root_post_id.clone());
            loop {
                let mut discovered_any = false;
                for post in posts {
                    let id = post.id.trim();
                    if id.is_empty() || id == root_post_id || ancestors.contains(id) {
                        continue;
                    }
                    let explicit_parent = post
                        .parent_id
                        .as_deref()
                        .map(str::trim)
                        .filter(|parent| !parent.is_empty() && *parent != id);
                    let thread_parent = post
                        .thread_id
                        .as_deref()
                        .map(str::trim)
                        .filter(|parent| !parent.is_empty() && *parent != id);
                    let is_direct = explicit_parent == Some(root_post_id.as_str());
                    let connects_to_tree = explicit_parent
                        .is_some_and(|parent| ancestors.contains(parent))
                        || thread_parent.is_some_and(|parent| ancestors.contains(parent));
                    if !connects_to_tree {
                        continue;
                    }

                    ancestors.insert(id.to_string());
                    root.known_tree_post_ids.push(id.to_string());
                    discovered_any = true;
                    changed = true;

                    let is_own_reply = own_post_ids.contains(id);
                    if !is_own_reply && (is_direct || include_descendants) {
                        reply_detected = true;
                        if detected_post_ids.insert(id.to_string()) {
                            reply_post_ids.push(id.to_string());
                        }
                    }
                }
                if !discovered_any {
                    break;
                }
            }
        }

        if changed {
            save_store(&self.store_path, &store)?;
        }
        Ok(ReplyProcessOutcome {
            reply_detected,
            reply_post_ids,
            error: self.take_warning(),
        })
    }

    pub fn install_custom_sound(&self, source_path: &Path) -> Result<Option<Vec<u8>>, String> {
        let metadata = fs::metadata(source_path).map_err(|e| {
            format!(
                "通知音ファイルを読み取れません ({}): {e}",
                source_path.display()
            )
        })?;
        if !metadata.is_file() {
            return Err("通知音には通常のファイルを選択してください".to_string());
        }
        if metadata.len() > MAX_CUSTOM_SOUND_BYTES {
            return Err("通知音ファイルは20 MiB以下にしてください".to_string());
        }

        fs::create_dir_all(&self.base_dir)
            .map_err(|e| format!("通知音保存先ディレクトリを作成できません: {e}"))?;
        let destination = self.custom_sound_path();
        let previous = fs::read(&destination).ok();
        let temp = self.base_dir.join(format!("{CUSTOM_SOUND_FILE}.tmp"));
        if temp.exists() {
            let _ = fs::remove_file(&temp);
        }
        fs::copy(source_path, &temp).map_err(|e| {
            format!(
                "通知音ファイルのコピーに失敗しました ({}): {e}",
                source_path.display()
            )
        })?;
        if destination.exists() {
            fs::remove_file(&destination)
                .map_err(|e| format!("以前の通知音ファイルを置換できません: {e}"))?;
        }
        fs::rename(&temp, &destination)
            .map_err(|e| format!("通知音ファイルを確定できません: {e}"))?;
        Ok(previous)
    }

    pub fn restore_custom_sound(&self, previous: Option<Vec<u8>>) -> Result<(), String> {
        let destination = self.custom_sound_path();
        match previous {
            Some(bytes) => {
                fs::create_dir_all(&self.base_dir)
                    .map_err(|e| format!("通知音保存先ディレクトリを作成できません: {e}"))?;
                fs::write(&destination, bytes)
                    .map_err(|e| format!("以前の通知音ファイルを復元できません: {e}"))
            }
            None => {
                if destination.exists() {
                    fs::remove_file(&destination)
                        .map_err(|e| format!("通知音ファイルのロールバックに失敗しました: {e}"))?;
                }
                Ok(())
            }
        }
    }

    pub fn remove_custom_sound(&self) -> Result<Option<Vec<u8>>, String> {
        let destination = self.custom_sound_path();
        let previous = fs::read(&destination).ok();
        if destination.exists() {
            fs::remove_file(&destination)
                .map_err(|e| format!("独自通知音ファイルを削除できません: {e}"))?;
        }
        Ok(previous)
    }

    pub fn load_current_sound(
        &self,
        app: &AppHandle,
        global: &GlobalConfig,
    ) -> Result<Vec<u8>, String> {
        if global.reply_notification_sound_kind == "custom" {
            return fs::read(self.custom_sound_path())
                .map_err(|e| format!("独自通知音ファイルを読み込めません: {e}"));
        }

        let resource_path = app
            .path()
            .resolve("resources/notify.wav", BaseDirectory::Resource)
            .map_err(|e| format!("既定通知音のパス解決に失敗しました: {e}"))?;
        if resource_path.exists() {
            return fs::read(&resource_path).map_err(|e| {
                format!(
                    "既定通知音を読み込めません ({}): {e}",
                    resource_path.display()
                )
            });
        }

        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("notify.wav");
        fs::read(&dev_path)
            .map_err(|e| format!("既定通知音を読み込めません ({}): {e}", dev_path.display()))
    }

    fn custom_sound_path(&self) -> PathBuf {
        self.base_dir.join(CUSTOM_SOUND_FILE)
    }
}

fn build_ui_state(store: &ReplyTrackingStore) -> ReplyNotificationUiState {
    let mut manual = Vec::new();
    let mut automatic = Vec::new();
    for root in &store.tracked_roots {
        let Some(post_id) = root.post_id.as_ref() else {
            continue;
        };
        let item = TrackedPostRef {
            site_id: root.site_id.clone(),
            post_id: post_id.clone(),
        };
        match root.source {
            TrackingSource::Manual => manual.push(item),
            TrackingSource::AutoOwn => automatic.push(item),
        }
    }
    manual.sort_by(|a, b| (&a.site_id, &a.post_id).cmp(&(&b.site_id, &b.post_id)));
    automatic.sort_by(|a, b| (&a.site_id, &a.post_id).cmp(&(&b.site_id, &b.post_id)));
    ReplyNotificationUiState {
        manual,
        automatic,
        error: String::new(),
    }
}

fn prune_expired(store: &mut ReplyTrackingStore, now: DateTime<Utc>) -> bool {
    let before = store.tracked_roots.len();
    store.tracked_roots.retain(|root| {
        now.signed_duration_since(root.created_at) < Duration::hours(TRACKING_TTL_HOURS)
    });
    before != store.tracked_roots.len()
}

fn resolve_pending_own_posts(
    store: &mut ReplyTrackingStore,
    site_id: &str,
    posts: &[ParsedPost],
    now: DateTime<Utc>,
) -> bool {
    let mut changed = false;
    let mut resolved = HashSet::new();

    for root in store.tracked_roots.iter_mut().filter(|root| {
        root.source == TrackingSource::AutoOwn
            && root.site_id == site_id
            && root.post_id.is_none()
            && root.pending_match.is_some()
    }) {
        let Some(pending) = root.pending_match.as_ref() else {
            continue;
        };
        let candidates = matching_candidates(
            posts,
            site_id,
            pending,
            root.created_at
                .max(now - Duration::hours(TRACKING_TTL_HOURS)),
        );
        if candidates.len() == 1 {
            let post_id = candidates[0].id.clone();
            root.post_id = Some(post_id.clone());
            root.pending_match = None;
            resolved.insert((root.site_id.clone(), post_id));
            changed = true;
        }
    }

    if !resolved.is_empty() {
        let before = store.tracked_roots.len();
        store.tracked_roots.retain(|root| {
            if root.source != TrackingSource::Manual {
                return true;
            }
            let Some(post_id) = root.post_id.as_ref() else {
                return true;
            };
            !resolved.contains(&(root.site_id.clone(), post_id.clone()))
        });
        changed |= before != store.tracked_roots.len();
    }

    changed
}

fn dedupe_resolved_auto_roots(store: &mut ReplyTrackingStore) -> bool {
    let before = store.tracked_roots.len();
    let mut seen = HashSet::new();
    store.tracked_roots.retain(|root| {
        if root.source != TrackingSource::AutoOwn {
            return true;
        }
        let Some(post_id) = root.post_id.as_ref() else {
            return true;
        };
        seen.insert((root.site_id.clone(), post_id.clone()))
    });
    before != store.tracked_roots.len()
}

fn matching_candidates<'a>(
    posts: &'a [ParsedPost],
    site_id: &str,
    pending: &PendingPostMatch,
    created_at: DateTime<Utc>,
) -> Vec<&'a ParsedPost> {
    let known_before: HashSet<&str> = pending
        .known_post_ids_before
        .iter()
        .map(String::as_str)
        .collect();
    posts
        .iter()
        .filter(|post| post.site_id == site_id)
        .filter(|post| !known_before.contains(post.id.as_str()))
        .filter(|post| {
            post.posted_at
                .as_deref()
                .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
                .map(|value| value.with_timezone(&Utc) >= created_at - Duration::minutes(2))
                .unwrap_or(true)
        })
        .filter(|post| compatible_text(&post.name, &pending.author))
        .filter(|post| compatible_text(&post.email, &pending.email))
        .filter(|post| compatible_text(&post.title, &pending.subject))
        .filter(|post| {
            let expected = normalize_body(&pending.body);
            expected.is_empty() || normalize_body(&post.body_text).starts_with(&expected)
        })
        .collect()
}

fn compatible_text(observed: &str, expected: &str) -> bool {
    let observed = normalize_field(observed);
    let expected = normalize_field(expected);
    expected.is_empty() || observed.is_empty() || observed == expected
}

fn normalize_field(value: &str) -> String {
    value
        .trim_matches(|c: char| c.is_whitespace() || c == '\u{3000}')
        .to_string()
}

fn normalize_body(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .trim_matches(|c: char| c.is_whitespace() || c == '\u{3000}')
        .to_string()
}

fn load_store(path: &Path) -> (ReplyTrackingStore, Option<String>) {
    if !path.exists() {
        return (ReplyTrackingStore::default(), None);
    }
    match fs::read_to_string(path) {
        Ok(source) => match serde_json::from_str::<ReplyTrackingStore>(&source) {
            Ok(mut store) => {
                store.version = STORE_VERSION;
                (store, None)
            }
            Err(error) => {
                let backup = path
                    .with_file_name(format!("tracking.corrupt-{}.json", Utc::now().timestamp()));
                let backup_result = fs::rename(path, &backup);
                let warning = match backup_result {
                    Ok(()) => format!(
                        "返信通知の追跡データが壊れていたため空状態から開始しました。破損データ: {} ({error})",
                        backup.display()
                    ),
                    Err(rename_error) => format!(
                        "返信通知の追跡データが壊れていたため空状態から開始しました。破損データの退避にも失敗しました: {rename_error} ({error})"
                    ),
                };
                (ReplyTrackingStore::default(), Some(warning))
            }
        },
        Err(error) => (
            ReplyTrackingStore::default(),
            Some(format!(
                "返信通知の追跡データを読み込めないため空状態から開始しました: {error}"
            )),
        ),
    }
}

fn save_store(path: &Path, store: &ReplyTrackingStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("返信通知追跡データの保存先を作成できません: {e}"))?;
    }
    let serialized = serde_json::to_vec_pretty(store)
        .map_err(|e| format!("返信通知追跡データのJSON化に失敗しました: {e}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, serialized)
        .map_err(|e| format!("返信通知追跡データの一時保存に失敗しました: {e}"))?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|e| format!("以前の返信通知追跡データを置換できません: {e}"))?;
    }
    fs::rename(&temp, path).map_err(|e| format!("返信通知追跡データを確定できません: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_service(name: &str) -> ReplyNotificationService {
        let dir = std::env::temp_dir().join(format!(
            "midoku-bosatsu-reply-notification-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        ReplyNotificationService::new_at_dir(dir).unwrap()
    }

    fn at(day: i64) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&format!("2026-08-{:02}T00:00:00Z", 1 + day))
            .unwrap()
            .with_timezone(&Utc)
    }

    fn post(id: &str, parent_id: Option<&str>) -> ParsedPost {
        ParsedPost {
            id: id.to_string(),
            site_id: "site".to_string(),
            title: String::new(),
            name: String::new(),
            email: String::new(),
            posted_at_raw: String::new(),
            posted_at: None,
            follow_url: None,
            thread_url: None,
            parent_id: parent_id.map(str::to_string),
            thread_id: None,
            body_html: String::new(),
            body_text: String::new(),
        }
    }

    #[test]
    fn manual_tracking_persists_and_can_be_removed() {
        let service = temp_service("manual");
        let state = service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();
        assert_eq!(state.manual.len(), 1);
        let reloaded = ReplyNotificationService::new_at_dir(service.base_dir.clone()).unwrap();
        assert_eq!(reloaded.ui_state(at(0)).unwrap().manual.len(), 1);
        assert!(reloaded
            .set_manual_tracking("site", "100", false, &[], at(0))
            .unwrap()
            .manual
            .is_empty());
    }

    #[test]
    fn tracked_roots_list_registration_dates_and_can_be_removed() {
        let service = temp_service("management");
        service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();

        assert_eq!(
            service.tracked_roots(at(1)).unwrap(),
            vec![TrackedReplyRootRef {
                site_id: "site".to_string(),
                post_id: "100".to_string(),
                created_at: at(0),
            }]
        );

        service
            .remove_tracked_roots(
                &[TrackedPostRef {
                    site_id: "site".to_string(),
                    post_id: "100".to_string(),
                }],
                at(1),
            )
            .unwrap();
        assert!(service.tracked_roots(at(1)).unwrap().is_empty());
    }

    #[test]
    fn manual_tracking_expires_after_seven_days() {
        let service = temp_service("ttl");
        service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();
        assert_eq!(service.ui_state(at(6)).unwrap().manual.len(), 1);
        assert!(service.ui_state(at(7)).unwrap().manual.is_empty());
    }

    #[test]
    fn direct_and_descendant_modes_are_distinct() {
        let service = temp_service("tree");
        service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();
        let first = service
            .process_posts(
                "site",
                &[post("101", Some("100")), post("102", Some("101"))],
                false,
                at(1),
            )
            .unwrap();
        assert!(first.reply_detected);
        assert_eq!(first.reply_post_ids, vec!["101"]);
        let second = service
            .process_posts("site", &[post("103", Some("102"))], false, at(2))
            .unwrap();
        assert!(!second.reply_detected);
        let third = service
            .process_posts("site", &[post("104", Some("103"))], true, at(3))
            .unwrap();
        assert!(third.reply_detected);
    }

    #[test]
    fn manual_tracking_baseline_does_not_notify_existing_replies() {
        let service = temp_service("manual-baseline");
        service
            .set_manual_tracking("site", "100", true, &["101".to_string()], at(0))
            .unwrap();
        let existing = [post("101", Some("100"))];
        assert!(
            !service
                .process_posts("site", &existing, false, at(1))
                .unwrap()
                .reply_detected
        );
        let new_reply = [post("102", Some("100"))];
        assert!(
            service
                .process_posts("site", &new_reply, false, at(2))
                .unwrap()
                .reply_detected
        );
    }

    #[test]
    fn thread_id_fallback_does_not_turn_an_indirect_post_into_a_direct_reply() {
        let service = temp_service("thread-fallback-direct");
        service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();
        let mut child = post("101", Some("404"));
        child.thread_id = Some("100".to_string());
        assert!(
            !service
                .process_posts("site", &[child], false, at(1))
                .unwrap()
                .reply_detected
        );
    }

    #[test]
    fn thread_id_fallback_still_extends_the_tree_for_descendant_mode() {
        let service = temp_service("thread-fallback-tree");
        service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();
        let mut child = post("101", Some("404"));
        child.thread_id = Some("100".to_string());
        assert!(
            !service
                .process_posts("site", &[child], false, at(1))
                .unwrap()
                .reply_detected
        );

        let grandchild = post("102", Some("101"));
        assert!(
            service
                .process_posts("site", &[grandchild], true, at(2))
                .unwrap()
                .reply_detected
        );
    }

    #[test]
    fn own_follow_post_does_not_trigger_reply_notification() {
        let service = temp_service("self-reply");
        let root = post("100", None);
        service
            .register_own_post_submission(
                "site",
                SubmittedPostFields::default(),
                &HashSet::new(),
                &[root],
                at(0),
            )
            .unwrap();

        let own_reply = post("101", Some("100"));
        let mut known_before = HashSet::new();
        known_before.insert("100".to_string());
        service
            .register_own_post_submission(
                "site",
                SubmittedPostFields::default(),
                &known_before,
                std::slice::from_ref(&own_reply),
                at(1),
            )
            .unwrap();
        assert!(
            !service
                .process_posts("site", &[own_reply], false, at(1))
                .unwrap()
                .reply_detected
        );

        let other_reply = post("102", Some("100"));
        assert!(
            service
                .process_posts("site", &[other_reply], false, at(2))
                .unwrap()
                .reply_detected
        );
    }

    #[test]
    fn same_reply_is_not_detected_twice() {
        let service = temp_service("dedupe");
        service
            .set_manual_tracking("site", "100", true, &[], at(0))
            .unwrap();
        let posts = [post("101", Some("100"))];
        assert!(
            service
                .process_posts("site", &posts, false, at(1))
                .unwrap()
                .reply_detected
        );
        assert!(
            !service
                .process_posts("site", &posts, false, at(2))
                .unwrap()
                .reply_detected
        );
    }
}
