mod config;
mod fetcher;
mod model;
mod parser;
mod reply_notification;
mod thread_hiding;

use config::{GlobalConfig, ReaderConfig, ReaderStyleConfig, SiteConfig};
use fetcher::ReaderState;
use model::{BbsActionViewResult, BbsPostFormInput, SiteFetchResult};
use reply_notification::{
    ReplyNotificationService, ReplyNotificationUiState, TrackedPostRef, TrackedReplyRootRef,
};
use std::path::Path;
use tauri::{ipc::Response, AppHandle, Manager, State};
use thread_hiding::{HiddenThreadRef, ThreadHidingService};

#[derive(serde::Serialize)]
struct PostFormEncodingWarning {
    encoding: String,
    invalid_text: String,
}

#[tauri::command]
fn get_post_form_encoding_warning(
    app: AppHandle,
    site_id: String,
    inputs: Vec<BbsPostFormInput>,
) -> Result<Option<PostFormEncodingWarning>, String> {
    let config = config::load_reader_config(&app)?;
    let site = config
        .sites
        .iter()
        .find(|site| site.id == site_id)
        .ok_or_else(|| format!("BBS設定に存在しないIDです: {site_id}"))?;
    let mut invalid_text = String::new();
    for input in inputs {
        invalid_text.push_str(&parser::encoding::find_non_encodable_characters(
            &input.value,
            &site.encoding,
        )?);
    }

    if invalid_text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PostFormEncodingWarning {
            encoding: site.encoding.clone(),
            invalid_text,
        }))
    }
}

#[tauri::command]
fn get_reader_config(app: AppHandle) -> Result<ReaderConfig, String> {
    config::load_reader_config(&app)
}

#[tauri::command]
fn export_config_file(
    app: AppHandle,
    file_name: String,
    destination_path: String,
) -> Result<(), String> {
    config::export_config_file(&app, &file_name, Path::new(&destination_path))
}

#[tauri::command]
async fn import_config_file(
    app: AppHandle,
    state: State<'_, ReaderState>,
    file_name: String,
    source_path: String,
) -> Result<ReaderConfig, String> {
    config::import_config_file(&app, &file_name, Path::new(&source_path))?;
    if file_name == "bbs.toml" {
        state.clear_reload_forms().await;
    }
    config::load_reader_config(&app)
}

#[tauri::command]
async fn reset_config_to_bundled(
    app: AppHandle,
    state: State<'_, ReaderState>,
    file_name: String,
) -> Result<ReaderConfig, String> {
    config::reset_config_to_bundled(&app, &file_name)?;
    if file_name == "bbs.toml" {
        state.clear_reload_forms().await;
    }
    config::load_reader_config(&app)
}

#[tauri::command]
async fn save_bbs_config(
    app: AppHandle,
    state: State<'_, ReaderState>,
    sites: Vec<SiteConfig>,
) -> Result<ReaderConfig, String> {
    config::save_bbs_sites(&app, sites)?;
    state.clear_reload_forms().await;
    config::load_reader_config(&app)
}

#[derive(serde::Serialize)]
struct GeneralSettingsResult {
    config: ReaderConfig,
    style: ReaderStyleConfig,
}

#[tauri::command]
fn get_reader_style(app: AppHandle) -> Result<ReaderStyleConfig, String> {
    config::load_reader_style(&app)
}

#[tauri::command]
async fn fetch_fxtwitter_status(
    state: State<'_, ReaderState>,
    status_id: String,
) -> Result<serde_json::Value, String> {
    state.fetch_fxtwitter_status(&status_id).await
}

#[tauri::command]
fn save_general_settings(
    app: AppHandle,
    service: State<'_, ReplyNotificationService>,
    mut global: GlobalConfig,
    style: ReaderStyleConfig,
    custom_sound_source_path: Option<String>,
    reset_notification_sound: bool,
) -> Result<GeneralSettingsResult, String> {
    if custom_sound_source_path.is_some() && reset_notification_sound {
        return Err("独自通知音の選択とデフォルト復帰を同時には指定できません".to_string());
    }

    config::validate_global_config(&global)?;
    config::validate_reader_style(&style)?;
    let previous_global = config::load_reader_config(&app)?.global;
    let previous_style = config::load_reader_style(&app)?;

    let mut previous_sound: Option<Option<Vec<u8>>> = None;
    if let Some(source) = custom_sound_source_path.as_deref() {
        let source_path = Path::new(source);
        let original_name = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "通知音ファイル名を取得できません".to_string())?
            .to_string();
        previous_sound = Some(service.install_custom_sound(source_path)?);
        global.reply_notification_sound_kind = "custom".to_string();
        global.reply_notification_sound_custom_name = original_name;
    } else if reset_notification_sound {
        previous_sound = Some(service.remove_custom_sound()?);
        global.reply_notification_sound_kind = "default".to_string();
        global.reply_notification_sound_custom_name.clear();
    }

    if let Err(error) = config::save_global_config(&app, global.clone()) {
        if let Some(previous) = previous_sound {
            let _ = service.restore_custom_sound(previous);
        }
        return Err(error);
    }
    if let Err(error) = config::save_reader_style(&app, style) {
        let _ = config::save_global_config(&app, previous_global);
        let _ = config::save_reader_style(&app, previous_style);
        if let Some(previous) = previous_sound {
            let _ = service.restore_custom_sound(previous);
        }
        return Err(error);
    }

    Ok(GeneralSettingsResult {
        config: config::load_reader_config(&app)?,
        style: config::load_reader_style(&app)?,
    })
}

#[tauri::command]
fn get_reply_notification_ui_state(
    service: State<'_, ReplyNotificationService>,
) -> Result<ReplyNotificationUiState, String> {
    service.ui_state(chrono::Utc::now())
}

#[tauri::command]
fn get_reply_notification_tracked_roots(
    service: State<'_, ReplyNotificationService>,
) -> Result<Vec<TrackedReplyRootRef>, String> {
    service.tracked_roots(chrono::Utc::now())
}

#[tauri::command]
fn remove_reply_notification_tracked_roots(
    service: State<'_, ReplyNotificationService>,
    targets: Vec<TrackedPostRef>,
) -> Result<(), String> {
    service.remove_tracked_roots(&targets, chrono::Utc::now())
}

#[tauri::command]
fn set_manual_reply_tracking(
    service: State<'_, ReplyNotificationService>,
    site_id: String,
    post_id: String,
    enabled: bool,
    baseline_post_ids: Vec<String>,
) -> Result<ReplyNotificationUiState, String> {
    service.set_manual_tracking(
        &site_id,
        &post_id,
        enabled,
        &baseline_post_ids,
        chrono::Utc::now(),
    )
}

#[tauri::command]
fn get_reply_notification_sound(
    app: AppHandle,
    service: State<'_, ReplyNotificationService>,
) -> Result<Response, String> {
    let global = config::load_reader_config(&app)?.global;
    let bytes = service.load_current_sound(&app, &global)?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn get_hidden_thread_keys(service: State<'_, ThreadHidingService>) -> Result<Vec<String>, String> {
    service.hidden_thread_keys(chrono::Utc::now())
}

#[tauri::command]
fn get_hidden_threads(
    service: State<'_, ThreadHidingService>,
) -> Result<Vec<HiddenThreadRef>, String> {
    service.hidden_threads(chrono::Utc::now())
}

#[tauri::command]
fn remove_hidden_threads(
    service: State<'_, ThreadHidingService>,
    targets: Vec<HiddenThreadRef>,
) -> Result<(), String> {
    service.remove_hidden_threads(&targets, chrono::Utc::now())
}

#[tauri::command]
fn hide_thread(
    service: State<'_, ThreadHidingService>,
    site_id: String,
    thread_id: String,
) -> Result<Vec<String>, String> {
    service.hide_thread(&site_id, &thread_id, chrono::Utc::now())
}

/// 実際の掲示板へ通常GETし、HTMLを掲示板指定文字コードからUTF-8へ変換して投稿を返す。
/// 同時に、レスポンス内の未読リロードFORMを次回POST用としてReaderStateへ保存する。
#[tauri::command]
async fn fetch_site_initial(
    app: AppHandle,
    state: State<'_, ReaderState>,
    service: State<'_, ReplyNotificationService>,
    site_id: String,
) -> Result<SiteFetchResult, String> {
    let reader_config = config::load_reader_config(&app)?;
    let site = config::find_site(&reader_config, &site_id)?.clone();

    if !site.enabled {
        return Err(format!("無効化されているサイトです: {}", site.name));
    }

    let mut result = state.fetch_initial(&site).await?;
    match service.process_posts(
        &site.id,
        &result.posts,
        reader_config.global.reply_notification_include_descendants,
        chrono::Utc::now(),
    ) {
        Ok(outcome) => {
            result.reply_detected = outcome.reply_detected;
            result.reply_post_ids = outcome.reply_post_ids;
            result.reply_notification_error = outcome.error;
        }
        Err(error) => result.reply_notification_error = error,
    }
    Ok(result)
}

/// 未読リロード用に保持しているFORMキャッシュを破棄する。
#[tauri::command]
async fn clear_reader_runtime_state(state: State<'_, ReaderState>) -> Result<(), String> {
    state.clear_reload_forms().await;
    Ok(())
}

/// 初回GETまたは前回POSTのレスポンスから保持したFORMを使い、未読リロードPOSTを実行する。
#[tauri::command]
async fn reload_site_unread(
    app: AppHandle,
    state: State<'_, ReaderState>,
    service: State<'_, ReplyNotificationService>,
    site_id: String,
) -> Result<SiteFetchResult, String> {
    let reader_config = config::load_reader_config(&app)?;
    let site = config::find_site(&reader_config, &site_id)?.clone();

    if !site.enabled {
        return Err(format!("無効化されているサイトです: {}", site.name));
    }

    let mut result = state.reload_unread(&site).await?;
    match service.process_posts(
        &site.id,
        &result.posts,
        reader_config.global.reply_notification_include_descendants,
        chrono::Utc::now(),
    ) {
        Ok(outcome) => {
            result.reply_detected = outcome.reply_detected;
            result.reply_post_ids = outcome.reply_post_ids;
            result.reply_notification_error = outcome.error;
        }
        Err(error) => result.reply_notification_error = error,
    }
    Ok(result)
}

#[tauri::command]
async fn fetch_bbs_action_view(
    app: AppHandle,
    state: State<'_, ReaderState>,
    site_id: String,
    href: String,
) -> Result<BbsActionViewResult, String> {
    let sites = config::load_reader_config(&app)?;
    let site = config::find_site(&sites, &site_id)?.clone();

    if !site.enabled {
        return Err(format!("無効化されているサイトです: {}", site.name));
    }

    state.fetch_action_view(&site, &href).await
}

#[tauri::command]
async fn submit_follow_post(
    app: AppHandle,
    state: State<'_, ReaderState>,
    service: State<'_, ReplyNotificationService>,
    site_id: String,
    source_url: String,
    inputs: Vec<BbsPostFormInput>,
) -> Result<BbsActionViewResult, String> {
    let sites = config::load_reader_config(&app)?;
    let site = config::find_site(&sites, &site_id)?.clone();

    if !site.enabled {
        return Err(format!("無効化されているサイトです: {}", site.name));
    }

    let tracking = state
        .submission_tracking_context(&site, &source_url, "follow", &inputs)
        .await?;
    let mut result = state.submit_follow_post(&site, &source_url, inputs).await?;
    if result.error_message.trim().is_empty() {
        if let Err(error) = service.register_own_post_submission(
            &site.id,
            tracking.submitted,
            &tracking.known_before,
            &result.posts,
            chrono::Utc::now(),
        ) {
            result.tracking_error = error;
        }
    }
    Ok(result)
}

#[tauri::command]
async fn fetch_new_post_form(
    app: AppHandle,
    state: State<'_, ReaderState>,
    site_id: String,
) -> Result<BbsActionViewResult, String> {
    let sites = config::load_reader_config(&app)?;
    let site = config::find_site(&sites, &site_id)?.clone();

    if !site.enabled {
        return Err(format!("無効化されているサイトです: {}", site.name));
    }

    state.fetch_new_post_form(&site).await
}

#[tauri::command]
async fn submit_new_post(
    app: AppHandle,
    state: State<'_, ReaderState>,
    service: State<'_, ReplyNotificationService>,
    site_id: String,
    source_url: String,
    inputs: Vec<BbsPostFormInput>,
) -> Result<BbsActionViewResult, String> {
    let sites = config::load_reader_config(&app)?;
    let site = config::find_site(&sites, &site_id)?.clone();

    if !site.enabled {
        return Err(format!("無効化されているサイトです: {}", site.name));
    }

    let tracking = state
        .submission_tracking_context(&site, &source_url, "new", &inputs)
        .await?;
    let mut result = state.submit_new_post(&site, &source_url, inputs).await?;
    if result.error_message.trim().is_empty() {
        if let Err(error) = service.register_own_post_submission(
            &site.id,
            tracking.submitted,
            &tracking.known_before,
            &result.posts,
            chrono::Utc::now(),
        ) {
            result.tracking_error = error;
        }
    }
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let reader_state = ReaderState::new().expect("failed to initialize HTTP client");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_process::init());

    builder
        .manage(reader_state)
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            config::ensure_user_configs(app.handle()).map_err(std::io::Error::other)?;
            let reply_service =
                ReplyNotificationService::new(app.handle()).map_err(std::io::Error::other)?;
            let thread_hiding_service =
                ThreadHidingService::new(app.handle()).map_err(std::io::Error::other)?;
            app.manage(reply_service);
            app.manage(thread_hiding_service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_reader_config,
            get_post_form_encoding_warning,
            export_config_file,
            import_config_file,
            reset_config_to_bundled,
            save_bbs_config,
            get_reader_style,
            fetch_fxtwitter_status,
            save_general_settings,
            get_reply_notification_ui_state,
            get_reply_notification_tracked_roots,
            remove_reply_notification_tracked_roots,
            set_manual_reply_tracking,
            get_reply_notification_sound,
            get_hidden_thread_keys,
            get_hidden_threads,
            remove_hidden_threads,
            hide_thread,
            fetch_site_initial,
            clear_reader_runtime_state,
            reload_site_unread,
            fetch_bbs_action_view,
            submit_follow_post,
            fetch_new_post_form,
            submit_new_post,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
