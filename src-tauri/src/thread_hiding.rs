use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const STORE_VERSION: u32 = 1;
const TTL_HOURS: i64 = 7 * 24;
const DIRECTORY: &str = "thread-hiding";
const FILE_NAME: &str = "hidden-threads.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct HiddenThread {
    site_id: String,
    thread_id: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HiddenThreadRef {
    pub site_id: String,
    pub thread_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HiddenThreadStore {
    version: u32,
    #[serde(default)]
    hidden_threads: Vec<HiddenThread>,
}

impl Default for HiddenThreadStore {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            hidden_threads: Vec::new(),
        }
    }
}

pub struct ThreadHidingService {
    store_path: PathBuf,
    store: Mutex<HiddenThreadStore>,
}

impl ThreadHidingService {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let base_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("スレッド非表示用ディレクトリを取得できません: {error}"))?
            .join(DIRECTORY);
        Self::new_at_dir(base_dir)
    }

    fn new_at_dir(base_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&base_dir)
            .map_err(|error| format!("スレッド非表示用ディレクトリを作成できません: {error}"))?;
        let store_path = base_dir.join(FILE_NAME);
        let store = load_store(&store_path)?;
        Ok(Self {
            store_path,
            store: Mutex::new(store),
        })
    }

    fn lock_store(&self) -> Result<MutexGuard<'_, HiddenThreadStore>, String> {
        self.store
            .lock()
            .map_err(|_| "スレッド非表示ストアのロックに失敗しました".to_string())
    }

    pub fn hidden_thread_keys(&self, now: DateTime<Utc>) -> Result<Vec<String>, String> {
        let mut store = self.lock_store()?;
        if prune_expired(&mut store, now) {
            save_store(&self.store_path, &store)?;
        }
        Ok(store.hidden_threads.iter().map(hidden_thread_key).collect())
    }

    pub fn hidden_threads(&self, now: DateTime<Utc>) -> Result<Vec<HiddenThreadRef>, String> {
        let mut store = self.lock_store()?;
        if prune_expired(&mut store, now) {
            save_store(&self.store_path, &store)?;
        }
        Ok(store
            .hidden_threads
            .iter()
            .map(|hidden| HiddenThreadRef {
                site_id: hidden.site_id.clone(),
                thread_id: hidden.thread_id.clone(),
                created_at: hidden.created_at,
            })
            .collect())
    }

    pub fn remove_hidden_threads(
        &self,
        targets: &[HiddenThreadRef],
        now: DateTime<Utc>,
    ) -> Result<(), String> {
        let mut store = self.lock_store()?;
        let mut changed = prune_expired(&mut store, now);
        let before = store.hidden_threads.len();
        store.hidden_threads.retain(|hidden| {
            !targets.iter().any(|target| {
                hidden.site_id == target.site_id && hidden.thread_id == target.thread_id
            })
        });
        changed |= before != store.hidden_threads.len();
        if changed {
            save_store(&self.store_path, &store)?;
        }
        Ok(())
    }

    pub fn hide_thread(
        &self,
        site_id: &str,
        thread_id: &str,
        now: DateTime<Utc>,
    ) -> Result<Vec<String>, String> {
        let site_id = site_id.trim();
        let thread_id = thread_id.trim();
        if site_id.is_empty() || thread_id.is_empty() {
            return Err("非表示にするBBS IDまたはスレッドIDが空です".to_string());
        }

        let mut store = self.lock_store()?;
        let mut changed = prune_expired(&mut store, now);
        if !store
            .hidden_threads
            .iter()
            .any(|hidden| hidden.site_id == site_id && hidden.thread_id == thread_id)
        {
            store.hidden_threads.push(HiddenThread {
                site_id: site_id.to_string(),
                thread_id: thread_id.to_string(),
                created_at: now,
            });
            changed = true;
        }
        if changed {
            save_store(&self.store_path, &store)?;
        }
        Ok(store.hidden_threads.iter().map(hidden_thread_key).collect())
    }
}

fn hidden_thread_key(hidden: &HiddenThread) -> String {
    format!("{}:{}", hidden.site_id, hidden.thread_id)
}

fn prune_expired(store: &mut HiddenThreadStore, now: DateTime<Utc>) -> bool {
    let before = store.hidden_threads.len();
    store
        .hidden_threads
        .retain(|hidden| now.signed_duration_since(hidden.created_at) < Duration::hours(TTL_HOURS));
    before != store.hidden_threads.len()
}

fn load_store(path: &Path) -> Result<HiddenThreadStore, String> {
    if !path.exists() {
        return Ok(HiddenThreadStore::default());
    }
    let bytes =
        fs::read(path).map_err(|error| format!("スレッド非表示データを読めません: {error}"))?;
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("スレッド非表示データが壊れています: {error}"))
}

fn save_store(path: &Path, store: &HiddenThreadStore) -> Result<(), String> {
    let contents = serde_json::to_vec_pretty(store)
        .map_err(|error| format!("スレッド非表示データをJSON化できません: {error}"))?;
    let temporary_path = path.with_extension("json.tmp");
    fs::write(&temporary_path, contents)
        .map_err(|error| format!("スレッド非表示データを一時保存できません: {error}"))?;
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("以前のスレッド非表示データを置換できません: {error}"))?;
    }
    fs::rename(&temporary_path, path)
        .map_err(|error| format!("スレッド非表示データを確定できません: {error}"))
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};

    use super::{HiddenThreadRef, ThreadHidingService};

    fn at(day: i64) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&format!("2026-08-{:02}T00:00:00Z", day + 1))
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn hidden_thread_persists_and_expires_after_exactly_seven_days() {
        let base_dir = std::env::temp_dir().join(format!(
            "midoku-bosatsu-thread-hiding-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base_dir);
        let service = ThreadHidingService::new_at_dir(base_dir.clone()).unwrap();

        service.hide_thread("misao", "100", at(0)).unwrap();
        assert_eq!(
            service.hidden_thread_keys(at(6)).unwrap(),
            vec!["misao:100"]
        );

        let reloaded = ThreadHidingService::new_at_dir(base_dir).unwrap();
        assert_eq!(
            reloaded.hidden_thread_keys(at(6)).unwrap(),
            vec!["misao:100"]
        );
        assert!(reloaded.hidden_thread_keys(at(7)).unwrap().is_empty());
    }

    #[test]
    fn hidden_threads_list_registration_dates_and_can_be_removed() {
        let base_dir = std::env::temp_dir().join(format!(
            "midoku-bosatsu-thread-hiding-management-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base_dir);
        let service = ThreadHidingService::new_at_dir(base_dir).unwrap();
        service.hide_thread("misao", "100", at(0)).unwrap();

        assert_eq!(
            service.hidden_threads(at(1)).unwrap(),
            vec![HiddenThreadRef {
                site_id: "misao".to_string(),
                thread_id: "100".to_string(),
                created_at: at(0),
            }]
        );

        service
            .remove_hidden_threads(
                &[HiddenThreadRef {
                    site_id: "misao".to_string(),
                    thread_id: "100".to_string(),
                    created_at: at(0),
                }],
                at(1),
            )
            .unwrap();
        assert!(service.hidden_threads(at(1)).unwrap().is_empty());
    }
}
