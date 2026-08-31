import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { open, save } from '@tauri-apps/plugin-dialog';
import './style.css';
import {
  checkForAppUpdate,
  checkForManualAppUpdate,
  createStartupUpdateSequence,
  installAppUpdate,
  type AppUpdate,
} from './app_updates.ts';
import { removeTreeEmptyLines } from './tree_body.ts';
import { buildTreeBodyPrefix } from './tree_prefix.ts';
import { buildTreeNodePrefixes } from './tree_layout.ts';
import { expandNumericCharacterReferences } from './numeric_character_references.ts';
import {
  notificationButtonMode,
  notificationButtonViewModel,
  notificationSoundMimeType,
  knownDescendantPostIds,
  chooseOldestUnreadReplyPostKey,
  replyNotificationPostPresentation,
  replyNotificationActions,
  trackingKey,
  type TrackingUiState,
} from './reply_notification.ts';
import {
  canStartUnreadReload,
  UNREAD_RELOAD_COOLDOWN_MS,
} from './reload_cooldown.ts';
import {
  clearPostLog,
  parsePostLog,
  savePostLog,
} from './post_log.ts';
import {
  arePostsSaved,
  parseSavedPosts,
  hasSavedPost,
  removePosts as removeSavedPosts,
  saveTreePosts as saveSavedTreePosts,
  removeSavedPost,
  savePosts as saveSavedPosts,
  savePost as saveSavedPost,
  savedTreeGroups,
  type SavedPost,
} from './saved_posts.ts';
import { textSearchRoot } from './text_search_scope.ts';
import {
  formatNewPostDestinationLabel,
  shouldConfirmNewPostSiteChange,
} from './new_post_destination.ts';
import { isPostSubmitShortcut } from './post_submit_shortcut.ts';
import { isPostNavigationShortcutTarget } from './keyboard_shortcut_target.ts';
import {
  bbsTimelineSelectionForShortcutKey,
  filterPostsForBbsTimeline,
} from './bbs_timeline_shortcut.ts';
import { bbsTimelineMenuItems } from './bbs_timeline_menu.ts';
import { formatCopiedPostFirstLine } from './post_copy_format.ts';
import { isReferencePostLink } from './post_link_actions.ts';
import {
  nextPostContextMenuIndex,
  pointerHitsTextRect,
  postContextMenuEntries,
  shouldOpenPostContextMenu,
  type PostContextMenuItem,
} from './post_context_menu.ts';
import {
  shouldRenderActionViewAsTree,
  shouldShowThreadTreeLink,
  shouldShowThreadHideLink,
} from './thread_tree_view.ts';
import {
  filterHiddenThreadPosts,
  threadVisibilityKey,
} from './thread_visibility.ts';
import {
  normalizeFxTwitterPreview,
  parseFxTwitterPreviewTextLinks,
  parseFxTwitterStatusUrl,
  truncateFxTwitterPreviewText,
  type FxTwitterPreview,
} from './fxtwitter_preview.ts';
import { buildYouTubeThumbnailUrl, parseYouTubeVideoUrl } from './youtube_preview.ts';

type GlobalConfig = {
  poll_interval_seconds: number;
  max_posts: number;
  post_order: 'newest_first' | 'oldest_first' | string;
  show_post_images: boolean;
  show_fxtwitter_previews: boolean;
  show_youtube_previews: boolean;
  show_image_detail_link: boolean;
  max_image_height_px: number;
  image_hover_window_percent: number;
  keyboard_shortcuts_enabled: boolean;
  viewing_mode_enabled: boolean;
  viewing_mode_interval_seconds: number;
  tree_view_enabled: boolean;
  post_saving_enabled: boolean;
  hide_tree_link: boolean;
  hide_thread_hide_link: boolean;
  expand_numeric_character_references: boolean;
  ng_handle_patterns: string;
  ng_body_patterns: string;
  highlight_handle_patterns: string;
  highlight_body_patterns: string;
  reply_notification_enabled: boolean;
  reply_notification_sound_enabled: boolean;
  reply_notification_sound_kind: 'default' | 'custom' | string;
  reply_notification_sound_custom_name: string;
  reply_notification_include_descendants: boolean;
};

type PostParserConfig = {
  mode: 'legacy_anchor_siblings' | 'css_post' | string;
  anchor_selector: string;
  id_attribute: string;
  header_tag: string;
  name_tag: string;
  info_tag: string;
  body_container_tag: string;
  body_tag: string;
  post_selector: string;
  post_id_attribute: string;
  post_id_prefix: string;
  title_selector: string;
  name_selector: string;
  date_selector: string;
  body_selector: string;
  date_prefix: string;
  timestamp_regex: string;
};

type ReloadFormConfig = {
  form_selector: string;
  submit_input_name: string;
  submit_input_name_fallbacks: string[];
  submit_value_regex: string;
  method: string;
  referer: string;
  include_hidden: boolean;
};

type BbsBadgeStyleConfig = {
  text_color: string;
  background_color: string;
  border_color: string;
};

type SiteConfig = {
  id: string;
  name: string;
  enabled: boolean;
  encoding: string;
  user_agent: string;
  timezone_offset_minutes: number;
  timezone_region?: string;
  badge_style: BbsBadgeStyleConfig;
  fetch: { url: string };
  post_parser: PostParserConfig;
  reload_form: ReloadFormConfig;
};

type ReaderConfig = {
  global: GlobalConfig;
  sites: SiteConfig[];
};

type ReaderStyleConfig = {
  system_font_family: string;
  system_font_size_px: number;
  post_font_family: string;
  post_font_size_px: number;

  post_background_color: string;
  post_text_color: string;
  post_quote_color: string;
  link_unvisited_color: string;
  link_hover_color: string;
  link_visited_color: string;
  post_author_color: string;
  post_subject_color: string;
  unread_post_background_color: string;
  unread_badge_text_color: string;
  unread_badge_background_color: string;

  post_date_color: string;
  post_border_color: string;
  unread_accent_color: string;

  highlight_text_color: string;
  highlight_background_color: string;
  current_post_border_color: string;
  tree_header_background_color: string;
  tree_read_post_text_color: string;
};

type StyleColorKey =
  | 'post_background_color'
  | 'post_text_color'
  | 'post_quote_color'
  | 'link_unvisited_color'
  | 'link_hover_color'
  | 'link_visited_color'
  | 'post_author_color'
  | 'post_subject_color'
  | 'unread_post_background_color'
  | 'unread_badge_text_color'
  | 'unread_badge_background_color'
  | 'post_date_color'
  | 'post_border_color'
  | 'current_post_border_color'
  | 'unread_accent_color'
  | 'tree_header_background_color'
  | 'tree_read_post_text_color';

type ColorField = { key: StyleColorKey; label: string; required?: boolean; input_id?: string };

const POST_COLOR_FIELDS: ColorField[] = [
  { key: 'post_background_color', label: '通常の背景色', required: true },
  { key: 'post_text_color', label: '通常の文字色', required: true },
  { key: 'post_quote_color', label: '投稿の引用部分の文字色', required: true },
  { key: 'link_unvisited_color', label: '未訪問リンクの文字色', required: true },
  { key: 'link_hover_color', label: 'リンクのマウスホバー時の文字色', required: true },
  { key: 'link_visited_color', label: '訪問済みリンクの文字色', required: true },
  { key: 'post_author_color', label: '投稿者名の文字色', required: true },
  { key: 'post_subject_color', label: '題名の文字色', required: true },
  { key: 'post_date_color', label: '投稿日（日時）の文字色' },
];

const ADVANCED_POST_COLOR_FIELDS: ColorField[] = [
  { key: 'unread_badge_background_color', label: '未読バッジの背景色', required: true },
  { key: 'unread_badge_text_color', label: '未読バッジの文字色', required: true },
  { key: 'unread_post_background_color', label: '未読投稿の背景色', required: true },
  { key: 'unread_accent_color', label: '未読アクセント・境界線の色' },
  { key: 'post_border_color', label: '投稿区切り線の色' },
  { key: 'current_post_border_color', label: 'フォーカス中の投稿の枠色', input_id: 'general-current-post-border-color' },
];

const TREE_COLOR_FIELDS: ColorField[] = [
  { key: 'tree_header_background_color', label: 'ツリーヘッダーの背景色', required: true },
  { key: 'tree_read_post_text_color', label: 'ツリー表示時の既読投稿の文字色', required: true },
];

const ALL_STYLE_COLOR_FIELDS = [...POST_COLOR_FIELDS, ...ADVANCED_POST_COLOR_FIELDS, ...TREE_COLOR_FIELDS];

const STYLE_COLOR_VAR_MAP: Record<StyleColorKey, string> = {
  post_background_color: '--post-background-color',
  post_text_color: '--post-text-color',
  post_quote_color: '--post-quote-color',
  link_unvisited_color: '--post-link-unvisited-color',
  link_hover_color: '--post-link-hover-color',
  link_visited_color: '--post-link-visited-color',
  post_author_color: '--post-author-color',
  post_subject_color: '--post-subject-color',
  unread_post_background_color: '--post-unread-background-color',
  unread_badge_text_color: '--unread-badge-text-color',
  unread_badge_background_color: '--unread-badge-background-color',
  post_date_color: '--post-date-color',
  post_border_color: '--post-border-color',
  current_post_border_color: '--current-post-border-color',
  unread_accent_color: '--unread-accent-color',
  tree_header_background_color: '--tree-header-background-color',
  tree_read_post_text_color: '--tree-read-post-text-color',
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

type GeneralSettingsResult = {
  config: ReaderConfig;
  style: ReaderStyleConfig;
};


type ParsedPost = {
  id: string;
  site_id: string;
  title: string;
  name: string;
  email: string;
  posted_at_raw: string;
  posted_at: string | null;
  follow_url: string | null;
  thread_url: string | null;
  parent_id: string | null;
  thread_id: string | null;
  body_html: string;
  body_text: string;
};

type BbsPostFormOption = {
  value: string;
  label: string;
};

type BbsPostFormControl = {
  id: string;
  name: string;
  label: string;
  user_field: 'author' | 'email' | 'subject' | 'body' | 'url' | null;
  control_type: string;
  value: string;
  checked: boolean;
  required: boolean;
  readonly: boolean;
  maxlength: number | null;
  options: BbsPostFormOption[];
};

type BbsPostForm = {
  source_url: string;
  action: string | null;
  method: string;
  controls: BbsPostFormControl[];
};

type BbsPostFormInput = {
  id: string;
  value: string;
  checked: boolean;
};

type BbsActionViewResult = {
  site_id: string;
  site_name: string;
  source_url: string;
  posts: ParsedPost[];
  message: string;
  error_message: string;
  tracking_error: string;
  post_form: BbsPostForm | null;
};

type SiteFetchResult = {
  site_id: string;
  site_name: string;
  request_method: 'GET' | 'POST' | string;
  fetched_at: string;
  posts: ParsedPost[];
  reply_detected: boolean;
  reply_post_ids: string[];
  reply_notification_error: string;
};

type ScrollAnchor = {
  postKey: string;
  viewportTop: number;
};

type ReadCursor = {
  timestamp: number;
  post_key: string;
};

type ResetReplyNotification = { site_id: string; post_id: string; created_at: string };
type ResetHiddenThread = { site_id: string; thread_id: string; created_at: string };

const READ_CURSOR_STORAGE_KEY = 'midoku-bosatsu.read-cursor.v1';
const POST_LOG_STORAGE_KEY = 'midoku-bosatsu.post-log.v1';
const SAVED_POSTS_STORAGE_KEY = 'midoku-bosatsu.saved-posts.v1';
const DEFAULT_VIEWING_MODE_INTERVAL_SECONDS = 5;
const MAX_VIEWING_MODE_INTERVAL_SECONDS = 86_400;
const NOTIFICATION_ICON_URL = '/icons/notification-audio.png';
const NOTIFICATION_ICON_ACTIVE_URL = '/icons/notification-audio-active.png';
const SAVE_ICON_OUTLINE_URL = '/icons/save-heart-outline.png';
const SAVE_ICON_FILLED_URL = '/icons/save-heart-filled.png';
const POST_COPY_EXCLUSION_SELECTOR = '.post-copy-exclusion, .site-badge, .unread-badge, .post-notification-button, .post-save-button';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="app-shell">
    <div class="timeline-layout">
      <nav class="timeline-navigation" aria-label="投稿タイムラインの操作">
        <button id="reload-button" class="primary-button" type="button">未読リロード</button>
        <button id="timeline-unread-jump-button" type="button" disabled>未読境界へ</button>
        <div class="bbs-timeline-switcher">
          <button id="bbs-timeline-switcher-button" type="button" aria-haspopup="menu" aria-controls="bbs-timeline-menu">BBS表示切替</button>
          <div id="bbs-timeline-menu" class="bbs-timeline-menu" role="menu" aria-label="表示するBBSを選択"></div>
        </div>
        <button id="saved-posts-button" type="button" hidden>保存済み投稿一覧</button>
        <button id="shortcut-key-list-button" type="button">キー一覧</button>
        <button id="new-post-button" type="button" disabled>新規投稿</button>
        <button id="settings-button" type="button" disabled>設定</button>
      </nav>

      <div class="timeline-content">
        <div id="text-search-bar" class="text-search-bar" hidden aria-label="投稿内文字列検索">
          <input id="text-search-input" class="text-search-input" type="search" placeholder="投稿を検索" autocomplete="off" spellcheck="false" aria-label="検索文字列">
          <label class="text-search-regex-option" title="入力を正規表現として検索します">
            <input id="text-search-regex" type="checkbox">
            <span>正規表現</span>
          </label>
          <span id="text-search-count" class="text-search-count" aria-live="polite">0 / 0</span>
          <button id="text-search-prev" class="text-search-button" type="button" aria-label="前の一致箇所">前へ</button>
          <button id="text-search-next" class="text-search-button" type="button" aria-label="次の一致箇所">次へ</button>
          <button id="text-search-close" class="text-search-button" type="button" aria-label="検索を閉じる">閉じる</button>
        </div>

        <section class="timeline-card">
          <div id="notice" class="notice">掲示板へ接続しています…</div>
          <div id="posts" class="posts" aria-live="polite"></div>
        </section>
      </div>
    </div>
  </main>

  <section id="bbs-action-view" class="bbs-action-view" hidden aria-hidden="true">
    <div class="bbs-action-view-shell" role="dialog" aria-modal="true" aria-labelledby="bbs-action-view-title">
      <header class="bbs-action-view-header">
        <div>
          <span id="bbs-action-view-site" class="status-label"></span>
          <h2 id="bbs-action-view-title">投稿リンク</h2>
        </div>
        <button id="bbs-action-view-close" class="icon-button" type="button" aria-label="投稿リンク表示を閉じる">閉じる</button>
      </header>
      <div id="bbs-action-view-content" class="bbs-action-view-content"></div>
    </div>
  </section>

  <section id="saved-posts-view" class="bbs-action-view saved-posts-view" hidden aria-hidden="true">
    <div class="bbs-action-view-shell" role="dialog" aria-modal="true" aria-labelledby="saved-posts-view-title">
      <header class="bbs-action-view-header">
        <div>
          <span class="status-label">SAVED POSTS</span>
          <h2 id="saved-posts-view-title">保存済み投稿</h2>
        </div>
        <button id="saved-posts-view-close" class="icon-button" type="button" aria-label="保存済み投稿を閉じる">閉じる</button>
      </header>
      <div id="saved-posts-view-content" class="bbs-action-view-content"></div>
    </div>
  </section>

  <section id="shortcut-key-list-view" class="bbs-action-view shortcut-key-list-view" hidden aria-hidden="true">
    <div class="bbs-action-view-shell" role="dialog" aria-modal="true" aria-labelledby="shortcut-key-list-view-title">
      <header class="bbs-action-view-header">
        <div>
          <h2 id="shortcut-key-list-view-title">ショートカットキー一覧</h2>
        </div>
        <button id="shortcut-key-list-view-close" class="icon-button" type="button" aria-label="ショートカットキー一覧を閉じる">閉じる</button>
      </header>
      <div class="bbs-action-view-content shortcut-key-list-view-content">
        <p class="shortcut-key-list-note">投稿タイムラインのショートカットは、一般設定でキーボード操作を有効にしている場合に使えます。</p>
        <section aria-labelledby="shortcut-key-list-post-navigation-title">
          <h3 id="shortcut-key-list-post-navigation-title">投稿タイムライン</h3>
          <dl class="shortcut-key-list">
            <dt><kbd>j</kbd></dt><dd>上の投稿へ移動</dd>
            <dt><kbd>k</kbd></dt><dd>下の投稿へ移動</dd>
            <dt><kbd>.</kbd></dt><dd>未読境界へ移動</dd>
            <dt><kbd>g</kbd></dt><dd>最新の投稿へ移動</dd>
            <dt><kbd>n</kbd></dt><dd>新規投稿画面を開く</dd>
            <dt><kbd>r</kbd></dt><dd>現在の投稿へフォロー投稿</dd>
            <dt><kbd>t</kbd></dt><dd>スレッド表示を開く</dd>
            <dt><kbd>Ctrl + t / Command + t</kbd></dt><dd>スレッドのツリー表示を開く</dd>
            <dt><kbd>d</kbd></dt><dd>現在の投稿を保存／解除</dd>
            <dt><kbd>Ctrl + r / Command + r</kbd></dt><dd>未読リロード</dd>
            <dt><kbd>Ctrl + b / Command + b</kbd></dt><dd>左ナビを表示／非表示</dd>
            <dt><kbd>Ctrl + 1〜9 / Command + 1〜9</kbd></dt><dd>登録順のBBS投稿だけを表示</dd>
            <dt><kbd>Ctrl + 0 / Command + 0</kbd></dt><dd>すべての掲示板を表示</dd>
          </dl>
        </section>
        <section aria-labelledby="shortcut-key-list-post-compose-title">
          <h3 id="shortcut-key-list-post-compose-title">投稿画面</h3>
          <dl class="shortcut-key-list">
            <dt><kbd>Ctrl + Enter / Command + Return</kbd></dt><dd>投稿を送信</dd>
          </dl>
        </section>
        <section aria-labelledby="shortcut-key-list-search-title">
          <h3 id="shortcut-key-list-search-title">投稿内検索</h3>
          <dl class="shortcut-key-list">
            <dt><kbd>Ctrl + f / Command + f</kbd></dt><dd>投稿内を検索</dd>
            <dt><kbd>Enter</kbd></dt><dd>次の検索結果</dd>
            <dt><kbd>Shift + Enter</kbd></dt><dd>前の検索結果</dd>
            <dt><kbd>Esc</kbd></dt><dd>画面・検索を閉じる</dd>
          </dl>
        </section>
      </div>
    </div>
  </section>

  <dialog id="settings-dialog" class="settings-dialog" hidden aria-hidden="true">
    <div class="settings-shell">
      <header class="settings-main-header">
        <div>
          <h2>設定</h2>
        </div>
        <button id="settings-close" class="icon-button" type="button" aria-label="設定を閉じる">閉じる</button>
      </header>

      <nav class="settings-tabs" role="tablist" aria-label="設定カテゴリ">
        <button id="settings-tab-general" class="settings-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="general-settings-dialog">一般設定</button>
        <button id="settings-tab-bbs" class="settings-tab" type="button" role="tab" aria-selected="false" aria-controls="bbs-settings-dialog">BBS設定</button>
        <button id="settings-tab-config-file" class="settings-tab" type="button" role="tab" aria-selected="false" aria-controls="config-file-settings-dialog">設定のインポート/エクスポート</button>
        <button id="settings-tab-reset" class="settings-tab" type="button" role="tab" aria-selected="false" aria-controls="reset-settings-dialog">リセット</button>
        <button id="settings-tab-version" class="settings-tab" type="button" role="tab" aria-selected="false" aria-controls="version-settings-dialog">バージョン</button>
      </nav>

      <div class="settings-panels">
        <section id="general-settings-dialog" class="general-settings-dialog settings-tab-panel" aria-labelledby="settings-tab-general">
    <div class="general-settings-shell">
      <header class="bbs-settings-header">
        <div>
          <span class="status-label">GENERAL SETTINGS</span>
          <h2>一般設定</h2>
          <p>表示や未読リロードに関する一般設定を変更します。フォント設定は reader-style.css と連動します。</p>
        </div>
        <button id="general-settings-close" class="icon-button" type="button" aria-label="一般設定を閉じる">閉じる</button>
      </header>

      <form id="general-settings-form" autocomplete="off">
        <div class="general-settings-content">
          <details class="settings-section">
            <summary class="settings-section-heading">
              <div><h3>アプリのシステム用フォント</h3></div>
            </summary>
            <div class="settings-grid">
              <label class="settings-span-2">フォントファミリー
                <input id="general-system-font-family" type="text" spellcheck="false">
                <small>ヘッダー、設定画面、固定ステータスバー、ボタンなどのUIに使います。</small>
              </label>
              <label>フォントサイズ（px）
                <input id="general-system-font-size" type="number" min="8" max="72" step="1">
              </label>
            </div>
            <div class="font-preview system-font-preview" aria-label="システムフォントプレビュー">
              <span class="status-label">PREVIEW</span>
              <div class="system-font-preview-sample">一般設定　BBS設定　未読リロード　最終取得</div>
            </div>
          </details>

          <details class="settings-section">
            <summary class="settings-section-heading">
              <div><h3>投稿表示のフォント</h3></div>
            </summary>
            <div class="settings-grid">
              <label class="settings-span-2">フォントファミリー
                <input id="general-post-font-family" type="text" spellcheck="false">
                <small>題名、投稿者、投稿日、本文、引用部分など投稿タイムラインだけに使います。</small>
              </label>
              <label>フォントサイズ（px）
                <input id="general-post-font-size" type="number" min="8" max="72" step="1">
              </label>
            </div>
            <div class="post-style-preview" aria-label="投稿表示プレビュー">
              <div class="post-preview-meta">
                <strong class="post-subject">＞題名</strong>
                <strong class="post-name">投稿者</strong>
                <span class="post-time">2026/08/14(金)20時46分00秒</span>
                <span class="site-badge">あやしいわーるど＠みさお</span>
                <span class="unread-badge">未読</span>
              </div>
              <div class="post-preview-body">通常の本文です。<br><span class="post-quote">&gt;半角の&gt;から始まる引用部分</span><br><a href="#" class="post-preview-link">未訪問リンク</a></div>
            </div>
          </details>

          <details class="settings-section">
            <summary class="settings-section-heading">
              <div>
                <h3>投稿表示の色</h3>
                <p class="settings-section-description">カラーピッカーとHEX値は連動します。変更中は投稿一覧にも即時プレビューされます。</p>
              </div>
            </summary>
            <div id="post-color-fields" class="color-settings-grid"></div>
            <div class="settings-subsection">
              <h4>専門的な設定</h4>
              <div id="advanced-post-color-fields" class="color-settings-grid"></div>
            </div>
          </details>

          <details class="settings-section general-timeline-section">
            <summary class="settings-section-heading">
              <div><h3>基本的な設定</h3></div>
            </summary>
            <div class="settings-grid">
              <label>未読リロード間隔（秒）
                <input id="general-poll-interval" type="number" min="1" max="86400" step="1">
                <small>自動で未読リロードする間隔です。BBSへの負荷を避けるため30秒以上にしてください。</small>
                <small id="general-poll-interval-warning" class="settings-inline-warning" hidden>BBSへの過剰な負荷を避けるため、未読リロード間隔は30秒以上に設定してください。</small>
              </label>
              <label>投稿表示上限数
                <input id="general-max-posts" type="number" min="1" max="100000" step="1">
                <small>各BBSごとに保持する最大投稿数です。 (登録したBBSが 3 で、投稿表示上限数が 100 なら、最大で 3 * 100 = 300件の投稿を保持します)</small>
              </label>
              <label class="settings-check settings-check-card">
                <input id="general-post-saving-enabled" type="checkbox"> 投稿保存機能をONにする
                <small>ONのとき、投稿やツリーを保存し、保存済み投稿一覧を利用できます。</small>
              </label>
              <label class="settings-check settings-check-card">
                <input id="general-expand-numeric-character-references" type="checkbox"> 数値文字参照を展開（&amp;#数字;が置き換わる）
                <small>本文中の <code>&amp;#123;</code> や <code>&amp;#x1F600;</code> を対応するUnicode文字に置き換えます。</small>
              </label>
              <label class="settings-check settings-check-card">
                <input id="general-hide-tree-link" type="checkbox"> 「木」を表示する
                <small>スレッドをツリー表示するための「木」を表示します。</small>
              </label>
              <label class="settings-check settings-check-card">
                <input id="general-hide-thread-hide-link" type="checkbox"> 「消」を表示する
                <small>スレッドを非表示にするための「消」を表示します。</small>
              </label>
            </div>
          </details>

          <details class="settings-section general-tree-section">
            <summary class="settings-section-heading">
              <div><h3>ツリー表示</h3></div>
            </summary>
            <div class="settings-grid">
              <label class="settings-check settings-check-card settings-span-2">
                <input id="general-tree-view-enabled" type="checkbox"> ツリー表示
                <small>常に投稿をツリー表示します。初期値はOFFです。</small>
              </label>
              <div id="tree-color-fields" class="color-settings-grid settings-span-2"></div>
            </div>
          </details>

          <details class="settings-section general-image-display-section">
            <summary class="settings-section-heading">
              <div><h3>メディア表示</h3></div>
            </summary>
            <div class="settings-grid">
              <section class="settings-subsection settings-span-2">
                <h4>画像表示</h4>
                <div class="settings-grid">
                  <label class="settings-check settings-check-card">
                    <input id="general-show-images" type="checkbox"> 画像リンクをプレビュー表示する
                    <small>OFFの場合は画像を読み込まず「画像を開く」リンクだけ表示します。</small>
                  </label>
                  <label class="settings-check settings-check-card">
                    <input id="general-show-image-detail" type="checkbox"> 詳希(;ﾟДﾟ)
                    <small>画像URLの左に [詳] を表示し、「詳」からGoogleレンズで画像を調べられるようにします。</small>
                  </label>
                  <div id="general-image-size-settings" class="settings-grid settings-span-2">
                    <label>画像サムネイル最大高 (px)
                      <input id="general-image-max-height" type="number" min="1" max="10000" step="1">
                      <small>通常時の画像サムネイルの最大高さです。</small>
                    </label>
                    <label>ホバー画像サイズ (ウィンドウ比 %)
                      <input id="general-image-hover-window-percent" type="number" min="1" max="100" step="1">
                      <small>画像にマウスを重ねたときの最大サイズです。幅・高さとも未読菩薩のウィンドウサイズに対する割合で制限します。初期値は90%です。</small>
                    </label>
                  </div>
                </div>
              </section>
              <section class="settings-subsection settings-span-2">
                <h4>SNS表示</h4>
                <div class="settings-grid">
                  <label class="settings-check settings-check-card">
                    <input id="general-show-fxtwitter-previews" type="checkbox"> Twitter (X) のリンクをプレビュー表示する
                    <small>ONにするとFxTwitterを使ってプレビュー表示します。</small>
                  </label>
                  <label class="settings-check settings-check-card">
                    <input id="general-show-youtube-previews" type="checkbox"> YouTubeリンクをプレビュー表示する
                    <small>ONにすると投稿内のYouTube動画を埋め込み表示します。</small>
                  </label>
                </div>
              </section>
            </div>
          </details>

          <details class="settings-section general-keyboard-section">
            <summary class="settings-section-heading">
              <div>
                <h3>キーボード操作</h3>
                <p class="settings-section-description">ショートカットキーでキーボードだけでもある程度操作可能にします。詳しくは、<a id="shortcut-key-list-description-link" href="#shortcut-key-list-view">ショートカットキー一覧</a>を参照。</p>
              </div>
            </summary>
            <div class="settings-grid keyboard-shortcut-settings-grid">
              <label class="settings-check settings-check-card settings-span-2">
                <input id="general-keyboard-shortcuts-enabled" type="checkbox"> キーボードショートカットを有効にする
              </label>
            </div>
          </details>

          <details class="settings-section general-reply-notification-section">
            <summary class="settings-section-heading">
              <div>
                <h3>レス通知</h3>
                <p class="settings-section-description">未読菩薩で追跡している投稿への返信を右下トースト通知と通知音で知らせます。</p>
              </div>
            </summary>
            <div class="settings-grid reply-notification-settings-grid">
              <label class="settings-check settings-check-card settings-span-2">
                <input id="general-reply-notification-enabled" type="checkbox"> レス通知をする（右下トースト通知）
                <small>初期値はOFFです。ONのとき各投稿に「通知」ボタンを表示します。</small>
              </label>
              <div id="general-reply-notification-options" class="settings-grid settings-span-2">
                <label class="settings-check settings-check-card settings-span-2">
                  <input id="general-reply-notification-include-descendants" type="checkbox"> 返信ツリー全体を通知対象にする
                  <small>OFFでは直接返信だけ、ONでは孫返信以降を含む返信ツリー全体を通知対象にします。</small>
                </label>
                <label class="settings-check settings-check-card settings-span-2">
                  <input id="general-reply-notification-sound-enabled" type="checkbox"> 通知音を鳴らす
                </label>
                <div class="settings-span-2 reply-notification-sound-row">
                  <span class="settings-field-label">通知音ファイル</span>
                  <strong id="general-reply-notification-sound-name">notify.ogg（既定）</strong>
                  <div class="settings-inline-actions">
                    <button id="general-reply-notification-choose-sound" type="button">音声ファイルを選択</button>
                    <button id="general-reply-notification-reset-sound" type="button">デフォルトに戻す</button>
                  </div>
                  <small>選択した音声は「保存して反映」時に未読菩薩のアプリデータ領域へコピーします。最大20 MiBです。</small>
                </div>
              </div>
            </div>
          </details>

          <details class="settings-section">
            <summary class="settings-section-heading">
              <div>
                <h3>NGワード</h3>
                <p class="settings-section-description">正規表現に一致した投稿をタイムラインから非表示にします。1行ごとに別のNGワードを書けます。改行は <code>|</code> と同じOR条件として扱います。</p>
              </div>
            </summary>
            <div class="settings-grid ng-word-settings-grid">
              <label class="settings-span-2">ハンドル（投稿者・メール・題名）
                <textarea id="general-ng-handle-patterns" rows="6" spellcheck="false" placeholder="荒らし&#10;spam@example\.com&#10;宣伝|広告"></textarea>
                <small>投稿者名・メールアドレス・題名のいずれかに正規表現が一致すると、その投稿を表示しません。</small>
              </label>
              <label class="settings-span-2">本文
                <textarea id="general-ng-body-patterns" rows="6" spellcheck="false" placeholder="禁止語&#10;https?://example\.com/&#10;連投.*荒らし"></textarea>
                <small>本文のテキストに正規表現が一致すると、その投稿を表示しません。空欄ならNG判定を行いません。</small>
              </label>
            </div>
          </details>

          <details class="settings-section general-highlight-section">
            <summary class="settings-section-heading">
              <div>
                <h3>ハイライト</h3>
                <p class="settings-section-description">正規表現に一致した文字列を強調表示します。1行ごとに別のパターンを書けます。改行は <code>|</code> と同じOR条件として扱います。</p>
              </div>
            </summary>
            <div class="settings-grid ng-word-settings-grid">
              <label class="settings-span-2">ハンドル（投稿者・題名）
                <textarea id="general-highlight-handle-patterns" rows="6" spellcheck="false" placeholder="注目ユーザー&#10;重要|速報"></textarea>
                <small>投稿者名・題名を対象にします。メールアドレス欄はハイライト対象に含めません。</small>
              </label>
              <label class="settings-span-2">本文
                <textarea id="general-highlight-body-patterns" rows="6" spellcheck="false" placeholder="重要語&#10;https?://example\.com/&#10;緊急.*告知"></textarea>
                <small>本文中で一致した文字列だけをハイライトします。空欄ならハイライトしません。</small>
              </label>
            </div>
            <div class="settings-grid highlight-style-settings-grid">
              <label>ハイライト文字色
                <span class="highlight-color-controls">
                  <input id="general-highlight-text-color-picker" type="color" aria-label="ハイライト文字色カラーピッカー">
                  <input id="general-highlight-text-color" type="text" spellcheck="false" placeholder="#000000">
                </span>
              </label>
              <label>ハイライト背景色
                <span class="highlight-color-controls">
                  <input id="general-highlight-background-color-picker" type="color" aria-label="ハイライト背景色カラーピッカー">
                  <input id="general-highlight-background-color" type="text" spellcheck="false" placeholder="#ffff00">
                </span>
              </label>
            </div>
            <div class="highlight-preview" aria-label="ハイライト表示プレビュー">通常の文字 <span class="post-highlight">ハイライト文字</span> 通常の文字</div>
          </details>

          <details class="settings-section general-viewing-mode-section">
            <summary class="settings-section-heading">
              <div>
                <h3>観賞用自動モード</h3>
                <p class="settings-section-description">未読投稿を自動で順番に表示します。</p>
              </div>
            </summary>
            <div class="settings-grid">
              <label class="settings-check settings-check-card settings-span-2">
                <input id="general-viewing-mode-enabled" type="checkbox"> 観賞用自動モードをONにする
                <small>未読投稿を古い順から新しい順へ表示します。投稿画面や設定画面を開いている間は一時停止します。</small>
              </label>
              <div id="general-viewing-mode-interval-settings" class="settings-grid settings-span-2">
                <label>表示間隔（秒）
                  <input id="general-viewing-mode-interval" type="number" min="1" max="86400" step="1">
                  <small>未読投稿を次へ表示するまでの間隔です。初期値は5秒です。</small>
                </label>
              </div>
            </div>
          </details>

        </div>
        <div id="general-settings-message" class="bbs-settings-message" aria-live="polite"></div>
        <footer class="bbs-settings-footer">
          <span id="general-dirty-label" class="settings-dirty-label">変更なし</span>
          <div class="bbs-settings-footer-buttons">
            <button id="general-discard-button" class="discard-button" type="button" disabled>変更を破棄</button>
            <button id="general-save-button" class="primary-button" type="submit">保存して反映</button>
          </div>
        </footer>
      </form>
    </div>
  </section>

        <section id="bbs-settings-dialog" class="bbs-settings-dialog settings-tab-panel" aria-labelledby="settings-tab-bbs" hidden>
    <div class="bbs-settings-shell">
      <header class="bbs-settings-header">
        <div>
          <h2>BBS設定</h2>
          <p>取得先BBSの追加・編集・削除を行います。保存すると bbs.toml に反映されます。</p>
        </div>
        <button id="bbs-settings-close" class="icon-button" type="button" aria-label="BBS設定を閉じる">閉じる</button>
      </header>

      <div class="bbs-settings-body">
        <aside class="bbs-settings-sidebar">
          <div class="bbs-settings-sidebar-heading">
            <strong>取得先BBS</strong>
            <button id="bbs-add-button" type="button">＋ 追加</button>
          </div>
          <div id="bbs-settings-list" class="bbs-settings-list" role="listbox" aria-label="BBS一覧"></div>
        </aside>

        <section class="bbs-settings-editor">
          <div id="bbs-settings-empty" class="bbs-settings-empty" hidden>
            <strong>BBSが登録されていません</strong>
            <p>左の「＋ 追加」から取得先BBSを追加してください。</p>
          </div>

          <form id="bbs-settings-form" autocomplete="off">
            <section class="settings-section">
              <div class="settings-section-heading">
                <div>
                  <h3>基本設定</h3>
                </div>
                <label class="settings-check"><input id="bbs-enabled" type="checkbox"> 有効</label>
              </div>
              <div class="settings-grid">
                <label>BBS ID<input id="bbs-id" type="text" spellcheck="false" required><small>英数字・-・_。投稿識別にも使うため一意にしてください。</small></label>
                <label>表示名<input id="bbs-name" type="text" required></label>
                <label class="settings-span-2">取得先URL<input id="bbs-url" type="url" spellcheck="false" required></label>
                <label>文字コード
                  <select id="bbs-encoding">
                    <option value="shift_jis">Shift_JIS / CP932</option>
                    <option value="utf-8">UTF-8</option>
                    <option value="euc-jp">EUC-JP</option>
                  </select>
                </label>
                <label>タイムゾーン
                  <select id="bbs-timezone">
                    <option value="christmas-indian">インド洋のクリスマス島 (UTC+7:00)</option>
                    <option value="japan" selected>日本 (UTC+9:00)</option>
                    <option value="christmas-pacific">太平洋のクリスマス島 (UTC+14:00)</option>
                    <option value="custom">カスタム</option>
                  </select>
                  <small>カスタムを選ぶとUTCオフセットを分単位で指定できます。</small>
                </label>
                <label id="bbs-timezone-custom-field" hidden>カスタムUTCオフセット（分）
                  <input id="bbs-timezone-custom-offset" type="number" min="-1440" max="1440" step="1" value="540">
                  <small>例: UTC+9:00 は 540、UTC-5:00 は -300。</small>
                </label>
                <label class="settings-span-2">User-Agent<input id="bbs-user-agent" type="text" spellcheck="false"></label>
              </div>

              <div class="settings-subsection">
                <div class="settings-section-heading">
                  <div><h4>BBS名バッジ</h4></div>
                  <span id="bbs-badge-preview" class="site-badge">BBS名</span>
                </div>
                <div class="settings-grid">
                  <label class="settings-span-2">CSSクラス
                    <input id="bbs-badge-css-class" type="text" readonly>
                    <small>BBS IDから自動生成されます。投稿のBBS名バッジにこのクラスを付与します。</small>
                  </label>
                  <label>文字色
                    <span class="color-setting-controls">
                      <input id="bbs-badge-text-color-picker" class="color-picker" type="color" aria-label="BBS名バッジの文字色 カラーピッカー">
                      <input id="bbs-badge-text-color" class="color-hex-input" type="text" maxlength="7" spellcheck="false" placeholder="#RRGGBB">
                    </span>
                  </label>
                  <label>背景色
                    <span class="color-setting-controls">
                      <input id="bbs-badge-background-color-picker" class="color-picker" type="color" aria-label="BBS名バッジの背景色 カラーピッカー">
                      <input id="bbs-badge-background-color" class="color-hex-input" type="text" maxlength="7" spellcheck="false" placeholder="#RRGGBB">
                    </span>
                  </label>
                  <label>枠色
                    <span class="color-setting-controls">
                      <input id="bbs-badge-border-color-picker" class="color-picker" type="color" aria-label="BBS名バッジの枠色 カラーピッカー">
                      <input id="bbs-badge-border-color" class="color-hex-input" type="text" maxlength="7" spellcheck="false" placeholder="#RRGGBB">
                    </span>
                  </label>
                </div>
              </div>
            </section>

            <section class="settings-section">
              <div class="settings-section-heading">
                <div><h3>投稿解析</h3></div>
              </div>
              <div class="settings-grid">
                <label>解析方式
                  <select id="bbs-parser-mode">
                    <option value="legacy_anchor_siblings">旧くずは系（anchor + sibling）</option>
                    <option value="css_post">CSSセレクタ型</option>
                  </select>
                </label>
                <label>投稿日接頭辞<input id="bbs-date-prefix" type="text"></label>
                <label class="settings-span-2">日時正規表現<input id="bbs-timestamp-regex" type="text" spellcheck="false"></label>
              </div>

              <div id="legacy-parser-fields" class="settings-subsection">
                <h4>旧くずは系</h4>
                <div class="settings-grid settings-grid-compact">
                  <label>投稿anchor selector<input id="bbs-anchor-selector" type="text" spellcheck="false"></label>
                  <label>ID属性<input id="bbs-id-attribute" type="text" spellcheck="false"></label>
                  <label>題名tag<input id="bbs-header-tag" type="text" spellcheck="false"></label>
                  <label>投稿者tag<input id="bbs-name-tag" type="text" spellcheck="false"></label>
                  <label>情報tag<input id="bbs-info-tag" type="text" spellcheck="false"></label>
                  <label>本文container tag<input id="bbs-body-container-tag" type="text" spellcheck="false"></label>
                  <label>本文tag<input id="bbs-body-tag" type="text" spellcheck="false"></label>
                </div>
              </div>

              <div id="css-parser-fields" class="settings-subsection" hidden>
                <h4>CSSセレクタ型</h4>
                <div class="settings-grid settings-grid-compact">
                  <label>投稿selector<input id="bbs-post-selector" type="text" spellcheck="false"></label>
                  <label>投稿ID属性<input id="bbs-post-id-attribute" type="text" spellcheck="false"></label>
                  <label>ID prefix<input id="bbs-post-id-prefix" type="text" spellcheck="false"></label>
                  <label>題名selector<input id="bbs-title-selector" type="text" spellcheck="false"></label>
                  <label>投稿者selector<input id="bbs-name-selector" type="text" spellcheck="false"></label>
                  <label>投稿日selector<input id="bbs-date-selector" type="text" spellcheck="false"></label>
                  <label>本文selector<input id="bbs-body-selector" type="text" spellcheck="false"></label>
                </div>
              </div>
            </section>

            <section class="settings-section">
              <div class="settings-section-heading">
                <div><h3>未読リロードFORM</h3></div>
              </div>
              <div class="settings-grid">
                <label>FORM selector<input id="bbs-form-selector" type="text" spellcheck="false"></label>
                <label>method<select id="bbs-method"><option value="POST">POST</option></select></label>
                <label>未読submit name<input id="bbs-submit-name" type="text" spellcheck="false"></label>
                <label>fallback name（カンマ区切り）<input id="bbs-submit-fallbacks" type="text" spellcheck="false"></label>
                <label class="settings-span-2">submit value 正規表現<input id="bbs-submit-value-regex" type="text" spellcheck="false"></label>
                <label class="settings-span-2">Referer<input id="bbs-referer" type="url" spellcheck="false"></label>
              </div>
            </section>

            <div id="bbs-settings-message" class="bbs-settings-message" aria-live="polite"></div>
            <footer class="bbs-settings-footer">
              <button id="bbs-delete-button" class="danger-button" type="button">このBBSを削除</button>
              <div class="bbs-settings-footer-main">
                <span id="bbs-dirty-label" class="settings-dirty-label">変更なし</span>
                <div class="bbs-settings-footer-buttons">
                  <button id="bbs-discard-button" class="discard-button" type="button" disabled>変更を破棄</button>
                  <button id="bbs-save-button" class="primary-button" type="submit">保存して反映</button>
                </div>
              </div>
            </footer>
          </form>
        </section>
      </div>
    </div>
  </section>
        <section id="config-file-settings-dialog" class="general-settings-dialog settings-tab-panel" aria-labelledby="settings-tab-config-file" hidden>
    <div class="general-settings-shell">
      <header class="bbs-settings-header">
        <div>
          <h2>設定のインポート/エクスポート</h2>
          <p>一般設定とBBS設定のファイルを個別にインポート/エクスポートできます。</p>
        </div>
      </header>
      <div class="general-settings-content">
        <section class="settings-section config-file-settings-section">
          <div class="settings-section-heading">
            <div>
              <h3>一般設定</h3>
              <p class="settings-section-description">一般設定をファイルとして保存したり、別の一般設定ファイルを読み込んだりできます。</p>
            </div>
          </div>
          <div class="settings-inline-actions">
            <button id="general-export-config-button" type="button">一般設定をファイルにエクスポート</button>
            <button id="general-import-config-button" type="button">一般設定をファイルからインポート</button>
          </div>
        </section>
        <section class="settings-section config-file-settings-section">
          <div class="settings-section-heading">
            <div>
              <h3>BBS設定</h3>
              <p class="settings-section-description">BBS設定をファイルとして保存したり、別のBBS設定ファイルを読み込んだりできます。</p>
            </div>
          </div>
          <div class="settings-inline-actions">
            <button id="bbs-export-config-button" type="button">BBS設定をファイルにエクスポート</button>
            <button id="bbs-import-config-button" type="button">BBS設定をファイルからインポート</button>
          </div>
        </section>
      </div>
      <div id="config-file-settings-message" class="bbs-settings-message" aria-live="polite"></div>
    </div>
  </section>
        <section id="reset-settings-dialog" class="general-settings-dialog settings-tab-panel" aria-labelledby="settings-tab-reset" hidden>
          <div class="general-settings-shell reset-settings-shell">
            <div class="reset-settings-content">
              <h2>リセット</h2>
              <section class="settings-section reset-data-section">
                <h3>レス通知</h3>
                <p class="settings-section-description">追跡中の投稿を選択して通知対象から外します。</p>
                <div id="reset-reply-notification-list" class="reset-item-list"></div>
                <button id="reset-remove-reply-notifications" class="reset-data-button" type="button" disabled>選択した通知設定を消す</button>
              </section>
              <section class="settings-section reset-data-section">
                <h3>非表示スレッド</h3>
                <p class="settings-section-description">「消」で登録したスレッドを選択して再表示します。</p>
                <div id="reset-hidden-thread-list" class="reset-item-list"></div>
                <button id="reset-remove-hidden-threads" class="reset-data-button" type="button" disabled>選択した非表示設定を消す</button>
              </section>
              <section class="settings-section reset-data-section">
                <h3>一般設定のリセット</h3>
                <p class="settings-section-description">一般設定をアプリ同梱のglobal.tomlの内容に戻します。表示スタイルは変更しません。</p>
                <button id="reset-general-settings" class="reset-data-button" type="button">一般設定をリセット</button>
              </section>
              <section class="settings-section reset-data-section">
                <h3>BBS設定のリセット</h3>
                <p class="settings-section-description">BBS設定をアプリ同梱のbbs.tomlの内容に戻し、取得先を再読み込みします。</p>
                <button id="reset-bbs-settings" class="reset-data-button" type="button">BBS設定をリセット</button>
              </section>
              <section class="settings-section reset-data-section">
                <h3>未読状態リセット</h3>
                <p class="settings-section-description">保存済みの既読位置を消去します。</p>
                <button id="reset-unread-state" class="reset-data-button" type="button">未読状態をリセット</button>
              </section>
              <section class="settings-section reset-data-section">
                <h3>取得ログ削除</h3>
                <p class="settings-section-description">再起動後に復元する取得済み投稿ログを削除します。</p>
                <button id="reset-post-log" class="reset-data-button" type="button">取得ログを削除</button>
              </section>
            </div>
            <div id="reset-settings-message" class="bbs-settings-message" aria-live="polite"></div>
          </div>
        </section>
        <section id="version-settings-dialog" class="general-settings-dialog settings-tab-panel" aria-labelledby="settings-tab-version" hidden>
          <div class="general-settings-shell version-settings-shell">
            <div class="version-settings-content">
              <h2>未読菩薩</h2>
              <p id="app-version">未読菩薩</p>
              <button id="check-app-update" type="button">アップデートを確認</button>
              <div id="available-app-update" hidden>
                <p id="available-app-update-version"></p>
                <p id="available-app-update-date"></p>
                <button id="install-app-update" type="button">アップデートする</button>
              </div>
              <p id="app-update-status" class="bbs-settings-message" aria-live="polite"></p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </dialog>

  <div id="image-hover-popup" class="image-hover-popup" hidden aria-hidden="true">
    <img id="image-hover-popup-image" class="image-hover-popup-image" alt="画像プレビュー">
  </div>

  <footer id="fixed-status-bar" class="fixed-status-bar" aria-label="取得ステータス">
    <div class="fixed-status-inner">
      <div class="fixed-status-main">
        <div class="fixed-status-metric">
          <span class="status-label">最終取得</span>
          <strong id="last-fetch">-</strong>
        </div>
        <div class="fixed-status-actions">
          <button id="unread-jump-button" type="button" disabled>未読境界へ</button>
        </div>
      </div>
      <div id="fixed-status-error-row" class="fixed-status-error-row" hidden>
        <span class="status-label">ERROR</span>
        <strong id="footer-error" class="footer-error-message has-error"></strong>
      </div>
    </div>
  </footer>
  <div id="reply-notification-popup" class="reply-notification-popup" hidden role="status" aria-live="polite">
    <strong>投稿にレスがつきました</strong>
  </div>
  <div id="thread-hide-undo-toast" class="thread-hide-undo-toast" hidden role="status" aria-live="polite">
    <span>投稿を非表示にしました</span>
    <button id="thread-hide-undo-button" type="button">戻す</button>
  </div>
  <div id="bbs-timeline-toast" class="bbs-timeline-toast" hidden role="status" aria-live="polite"></div>
`;

const lastFetchElement = mustElement<HTMLElement>('#last-fetch');
const footerErrorElement = mustElement<HTMLElement>('#footer-error');
const footerErrorRow = mustElement<HTMLElement>('#fixed-status-error-row');
const replyNotificationBannerRow = mustElement<HTMLElement>('#reply-notification-popup');
replyNotificationBannerRow.addEventListener('click', () => {
  jumpToOldestUnreadReplyNotification();
});
const threadHideUndoToast = mustElement<HTMLElement>('#thread-hide-undo-toast');
const threadHideUndoButton = mustElement<HTMLButtonElement>('#thread-hide-undo-button');
const bbsTimelineToast = mustElement<HTMLElement>('#bbs-timeline-toast');
const fixedStatusBar = mustElement<HTMLElement>('#fixed-status-bar');
const noticeElement = mustElement<HTMLElement>('#notice');
const postsElement = mustElement<HTMLDivElement>('#posts');
const bbsActionView = mustElement<HTMLElement>('#bbs-action-view');
const bbsActionViewShell = mustElement<HTMLElement>('.bbs-action-view-shell');
const bbsActionViewSite = mustElement<HTMLElement>('#bbs-action-view-site');
const bbsActionViewTitle = mustElement<HTMLElement>('#bbs-action-view-title');
const bbsActionViewContent = mustElement<HTMLDivElement>('#bbs-action-view-content');
const bbsActionViewCloseButton = mustElement<HTMLButtonElement>('#bbs-action-view-close');
const savedPostsView = mustElement<HTMLElement>('#saved-posts-view');
const savedPostsViewContent = mustElement<HTMLDivElement>('#saved-posts-view-content');
const savedPostsViewCloseButton = mustElement<HTMLButtonElement>('#saved-posts-view-close');
const postContextMenu = document.createElement('div');
postContextMenu.className = 'post-context-menu';
postContextMenu.hidden = true;
postContextMenu.setAttribute('role', 'menu');
document.body.append(postContextMenu);
const shortcutKeyListView = mustElement<HTMLElement>('#shortcut-key-list-view');
const shortcutKeyListViewCloseButton = mustElement<HTMLButtonElement>('#shortcut-key-list-view-close');
const shortcutKeyListDescriptionLink = mustElement<HTMLAnchorElement>('#shortcut-key-list-description-link');
const imageHoverPopup = mustElement<HTMLDivElement>('#image-hover-popup');
const imageHoverPopupImage = mustElement<HTMLImageElement>('#image-hover-popup-image');
const textSearchBar = mustElement<HTMLDivElement>('#text-search-bar');
const textSearchInput = mustElement<HTMLInputElement>('#text-search-input');
const textSearchRegexInput = mustElement<HTMLInputElement>('#text-search-regex');
const textSearchCount = mustElement<HTMLElement>('#text-search-count');
const textSearchPrevButton = mustElement<HTMLButtonElement>('#text-search-prev');
const textSearchNextButton = mustElement<HTMLButtonElement>('#text-search-next');
const textSearchCloseButton = mustElement<HTMLButtonElement>('#text-search-close');
const reloadButton = mustElement<HTMLButtonElement>('#reload-button');
const timelineLayout = mustElement<HTMLElement>('.timeline-layout');
const timelineNavigation = mustElement<HTMLElement>('.timeline-navigation');
const bbsTimelineMenu = mustElement<HTMLDivElement>('#bbs-timeline-menu');
const newPostButton = mustElement<HTMLButtonElement>('#new-post-button');
const savedPostsButton = mustElement<HTMLButtonElement>('#saved-posts-button');
const shortcutKeyListButton = mustElement<HTMLButtonElement>('#shortcut-key-list-button');
const timelineUnreadJumpButton = mustElement<HTMLButtonElement>('#timeline-unread-jump-button');
const unreadJumpButton = mustElement<HTMLButtonElement>('#unread-jump-button');
const settingsButton = mustElement<HTMLButtonElement>('#settings-button');
const settingsDialog = mustElement<HTMLDialogElement>('#settings-dialog');
const settingsCloseButton = mustElement<HTMLButtonElement>('#settings-close');
const appVersion = mustElement<HTMLParagraphElement>('#app-version');
const checkAppUpdateButton = mustElement<HTMLButtonElement>('#check-app-update');
const availableAppUpdateElement = mustElement<HTMLDivElement>('#available-app-update');
const availableAppUpdateVersion = mustElement<HTMLParagraphElement>('#available-app-update-version');
const availableAppUpdateDate = mustElement<HTMLParagraphElement>('#available-app-update-date');
const installAppUpdateButton = mustElement<HTMLButtonElement>('#install-app-update');
const appUpdateStatus = mustElement<HTMLParagraphElement>('#app-update-status');
let availableAppUpdate: AppUpdate | null = null;

async function showAppVersion(): Promise<void> {
  try {
    appVersion.textContent = `未読菩薩 v${await getVersion()}`;
  } catch {
    // Tauri のバージョン情報を取得できない開発環境ではアプリ名のみを表示する。
  }
}

void showAppVersion();

function showAppUpdateStatus(message: string, error = false): void {
  appUpdateStatus.textContent = message;
  appUpdateStatus.classList.toggle('settings-message-error', error);
}

function formatAppUpdateDate(date: string | undefined): string {
  if (!date) return '公開日: 不明';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return `公開日: ${date}`;
  return `公開日: ${new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' }).format(parsed)}`;
}

async function checkForManualUpdate(): Promise<void> {
  checkAppUpdateButton.disabled = true;
  installAppUpdateButton.disabled = true;
  availableAppUpdateElement.hidden = true;
  availableAppUpdate = null;
  showAppUpdateStatus('アップデートを確認しています。');

  try {
    const update = await checkForManualAppUpdate();
    if (!update) {
      showAppUpdateStatus('最新バージョンです。');
      return;
    }

    availableAppUpdate = update;
    availableAppUpdateVersion.textContent = `新しいバージョン: v${update.version}`;
    availableAppUpdateDate.textContent = formatAppUpdateDate(update.date);
    availableAppUpdateElement.hidden = false;
    installAppUpdateButton.disabled = false;
    showAppUpdateStatus('アップデートが見つかりました。');
  } catch (error) {
    console.error(error);
    showAppUpdateStatus('アップデートを確認できませんでした。しばらくしてからもう一度お試しください。', true);
  } finally {
    checkAppUpdateButton.disabled = false;
  }
}

async function installManualUpdate(): Promise<void> {
  if (!availableAppUpdate) return;

  checkAppUpdateButton.disabled = true;
  installAppUpdateButton.disabled = true;
  showAppUpdateStatus('アップデートをダウンロードしてインストールしています。');

  try {
    await installAppUpdate(availableAppUpdate);
  } catch (error) {
    console.error(error);
    checkAppUpdateButton.disabled = false;
    installAppUpdateButton.disabled = false;
    showAppUpdateStatus('アップデートを完了できませんでした。アプリはそのまま利用できます。', true);
  }
}

const settingsTabGeneralButton = mustElement<HTMLButtonElement>('#settings-tab-general');
const settingsTabBbsButton = mustElement<HTMLButtonElement>('#settings-tab-bbs');
const settingsTabConfigFileButton = mustElement<HTMLButtonElement>('#settings-tab-config-file');
const settingsTabResetButton = mustElement<HTMLButtonElement>('#settings-tab-reset');
const settingsTabVersionButton = mustElement<HTMLButtonElement>('#settings-tab-version');
const generalSettingsDialog = mustElement<HTMLElement>('#general-settings-dialog');
const generalSettingsCloseButton = mustElement<HTMLButtonElement>('#general-settings-close');
const configFileSettingsDialog = mustElement<HTMLElement>('#config-file-settings-dialog');
const resetSettingsDialog = mustElement<HTMLElement>('#reset-settings-dialog');
const versionSettingsDialog = mustElement<HTMLElement>('#version-settings-dialog');
const resetReplyNotificationList = mustElement<HTMLDivElement>('#reset-reply-notification-list');
const resetHiddenThreadList = mustElement<HTMLDivElement>('#reset-hidden-thread-list');
const resetRemoveReplyNotificationsButton = mustElement<HTMLButtonElement>('#reset-remove-reply-notifications');
const resetRemoveHiddenThreadsButton = mustElement<HTMLButtonElement>('#reset-remove-hidden-threads');
const resetGeneralSettingsButton = mustElement<HTMLButtonElement>('#reset-general-settings');
const resetBbsSettingsButton = mustElement<HTMLButtonElement>('#reset-bbs-settings');
const resetUnreadStateButton = mustElement<HTMLButtonElement>('#reset-unread-state');
const resetPostLogButton = mustElement<HTMLButtonElement>('#reset-post-log');
const resetSettingsMessage = mustElement<HTMLDivElement>('#reset-settings-message');
const configFileSettingsMessage = mustElement<HTMLDivElement>('#config-file-settings-message');
const generalSettingsForm = mustElement<HTMLFormElement>('#general-settings-form');
const generalSystemFontFamilyInput = mustElement<HTMLInputElement>('#general-system-font-family');
const generalSystemFontSizeInput = mustElement<HTMLInputElement>('#general-system-font-size');
const generalPostFontFamilyInput = mustElement<HTMLInputElement>('#general-post-font-family');
const generalPostFontSizeInput = mustElement<HTMLInputElement>('#general-post-font-size');
const postColorFieldsElement = mustElement<HTMLDivElement>('#post-color-fields');
const advancedPostColorFieldsElement = mustElement<HTMLDivElement>('#advanced-post-color-fields');
const treeColorFieldsElement = mustElement<HTMLDivElement>('#tree-color-fields');
const generalPollIntervalInput = mustElement<HTMLInputElement>('#general-poll-interval');
const generalPollIntervalWarning = mustElement<HTMLElement>('#general-poll-interval-warning');
const generalMaxPostsInput = mustElement<HTMLInputElement>('#general-max-posts');
const generalPostSavingEnabledInput = mustElement<HTMLInputElement>('#general-post-saving-enabled');
const generalTreeViewEnabledInput = mustElement<HTMLInputElement>('#general-tree-view-enabled');
const generalHideTreeLinkInput = mustElement<HTMLInputElement>('#general-hide-tree-link');
const generalHideThreadHideLinkInput = mustElement<HTMLInputElement>('#general-hide-thread-hide-link');
const generalShowImagesInput = mustElement<HTMLInputElement>('#general-show-images');
const generalShowFxTwitterPreviewsInput = mustElement<HTMLInputElement>('#general-show-fxtwitter-previews');
const generalShowYouTubePreviewsInput = mustElement<HTMLInputElement>('#general-show-youtube-previews');
const generalImageSizeSettings = mustElement<HTMLDivElement>('#general-image-size-settings');
const generalExpandNumericCharacterReferencesInput = mustElement<HTMLInputElement>('#general-expand-numeric-character-references');
const generalShowImageDetailInput = mustElement<HTMLInputElement>('#general-show-image-detail');
const generalImageMaxHeightInput = mustElement<HTMLInputElement>('#general-image-max-height');
const generalImageHoverWindowPercentInput = mustElement<HTMLInputElement>('#general-image-hover-window-percent');
const generalKeyboardShortcutsEnabledInput = mustElement<HTMLInputElement>('#general-keyboard-shortcuts-enabled');
const generalViewingModeEnabledInput = mustElement<HTMLInputElement>('#general-viewing-mode-enabled');
const generalViewingModeIntervalSettings = mustElement<HTMLDivElement>('#general-viewing-mode-interval-settings');
const generalViewingModeIntervalInput = mustElement<HTMLInputElement>('#general-viewing-mode-interval');
const generalReplyNotificationEnabledInput = mustElement<HTMLInputElement>('#general-reply-notification-enabled');
const generalReplyNotificationOptions = mustElement<HTMLDivElement>('#general-reply-notification-options');
const generalReplyNotificationIncludeDescendantsInput = mustElement<HTMLInputElement>('#general-reply-notification-include-descendants');
const generalReplyNotificationSoundEnabledInput = mustElement<HTMLInputElement>('#general-reply-notification-sound-enabled');
const generalReplyNotificationSoundName = mustElement<HTMLElement>('#general-reply-notification-sound-name');
const generalReplyNotificationChooseSoundButton = mustElement<HTMLButtonElement>('#general-reply-notification-choose-sound');
const generalReplyNotificationResetSoundButton = mustElement<HTMLButtonElement>('#general-reply-notification-reset-sound');
const generalNgHandlePatternsInput = mustElement<HTMLTextAreaElement>('#general-ng-handle-patterns');
const generalNgBodyPatternsInput = mustElement<HTMLTextAreaElement>('#general-ng-body-patterns');
const generalHighlightHandlePatternsInput = mustElement<HTMLTextAreaElement>('#general-highlight-handle-patterns');
const generalHighlightBodyPatternsInput = mustElement<HTMLTextAreaElement>('#general-highlight-body-patterns');
const generalHighlightTextColorPicker = mustElement<HTMLInputElement>('#general-highlight-text-color-picker');
const generalHighlightTextColorInput = mustElement<HTMLInputElement>('#general-highlight-text-color');
const generalHighlightBackgroundColorPicker = mustElement<HTMLInputElement>('#general-highlight-background-color-picker');
const generalHighlightBackgroundColorInput = mustElement<HTMLInputElement>('#general-highlight-background-color');
const generalSettingsMessage = mustElement<HTMLDivElement>('#general-settings-message');
const generalDirtyLabel = mustElement<HTMLElement>('#general-dirty-label');
const generalDiscardButton = mustElement<HTMLButtonElement>('#general-discard-button');
const generalSaveButton = mustElement<HTMLButtonElement>('#general-save-button');
const generalExportConfigButton = mustElement<HTMLButtonElement>('#general-export-config-button');
const generalImportConfigButton = mustElement<HTMLButtonElement>('#general-import-config-button');

type ColorInputPair = { picker: HTMLInputElement; text: HTMLInputElement };
const postColorInputs = new Map<StyleColorKey, ColorInputPair>();
const advancedPostColorInputs = new Map<StyleColorKey, ColorInputPair>();
const treeColorInputs = new Map<StyleColorKey, ColorInputPair>();

function renderColorFields(
  fields: ColorField[],
  container: HTMLElement,
  inputs: Map<StyleColorKey, ColorInputPair>,
): void {
  for (const field of fields) {
    const wrapper = document.createElement('label');
    wrapper.className = 'color-setting-item';

    const labelRow = document.createElement('span');
    labelRow.className = 'color-setting-label';
    labelRow.textContent = field.required ? `${field.label} *` : field.label;

    const controls = document.createElement('span');
    controls.className = 'color-setting-controls';

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'color-picker';
    if (field.input_id) picker.id = `${field.input_id}-picker`;
    picker.setAttribute('aria-label', `${field.label} カラーピッカー`);

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'color-hex-input';
    if (field.input_id) text.id = field.input_id;
    text.maxLength = 7;
    text.spellcheck = false;
    text.placeholder = '#RRGGBB';
    text.setAttribute('aria-label', `${field.label} HEX値`);

    controls.append(picker, text);
    wrapper.append(labelRow, controls);
    container.appendChild(wrapper);
    inputs.set(field.key, { picker, text });
  }
}

renderColorFields(POST_COLOR_FIELDS, postColorFieldsElement, postColorInputs);
renderColorFields(ADVANCED_POST_COLOR_FIELDS, advancedPostColorFieldsElement, advancedPostColorInputs);
renderColorFields(TREE_COLOR_FIELDS, treeColorFieldsElement, treeColorInputs);
const generalCurrentPostBorderColorPicker = mustElement<HTMLInputElement>('#general-current-post-border-color-picker');
const generalCurrentPostBorderColorInput = mustElement<HTMLInputElement>('#general-current-post-border-color');
const bbsSettingsDialog = mustElement<HTMLElement>('#bbs-settings-dialog');
const bbsSettingsCloseButton = mustElement<HTMLButtonElement>('#bbs-settings-close');
const bbsSettingsList = mustElement<HTMLDivElement>('#bbs-settings-list');
const bbsAddButton = mustElement<HTMLButtonElement>('#bbs-add-button');
const bbsSettingsForm = mustElement<HTMLFormElement>('#bbs-settings-form');
const bbsSettingsEmpty = mustElement<HTMLDivElement>('#bbs-settings-empty');
const bbsDeleteButton = mustElement<HTMLButtonElement>('#bbs-delete-button');
const bbsDiscardButton = mustElement<HTMLButtonElement>('#bbs-discard-button');
const bbsSaveButton = mustElement<HTMLButtonElement>('#bbs-save-button');
const bbsExportConfigButton = mustElement<HTMLButtonElement>('#bbs-export-config-button');
const bbsImportConfigButton = mustElement<HTMLButtonElement>('#bbs-import-config-button');
const bbsSettingsMessage = mustElement<HTMLDivElement>('#bbs-settings-message');
const bbsDirtyLabel = mustElement<HTMLElement>('#bbs-dirty-label');
const bbsEnabledInput = mustElement<HTMLInputElement>('#bbs-enabled');
const bbsIdInput = mustElement<HTMLInputElement>('#bbs-id');
const bbsNameInput = mustElement<HTMLInputElement>('#bbs-name');
const bbsUrlInput = mustElement<HTMLInputElement>('#bbs-url');
const bbsEncodingInput = mustElement<HTMLSelectElement>('#bbs-encoding');
const bbsTimezoneInput = mustElement<HTMLSelectElement>('#bbs-timezone');
const bbsTimezoneCustomField = mustElement<HTMLElement>('#bbs-timezone-custom-field');
const bbsTimezoneCustomOffsetInput = mustElement<HTMLInputElement>('#bbs-timezone-custom-offset');
const bbsUserAgentInput = mustElement<HTMLInputElement>('#bbs-user-agent');
const bbsBadgeCssClassInput = mustElement<HTMLInputElement>('#bbs-badge-css-class');
const bbsBadgePreview = mustElement<HTMLSpanElement>('#bbs-badge-preview');
const bbsBadgeTextColorPicker = mustElement<HTMLInputElement>('#bbs-badge-text-color-picker');
const bbsBadgeTextColorInput = mustElement<HTMLInputElement>('#bbs-badge-text-color');
const bbsBadgeBackgroundColorPicker = mustElement<HTMLInputElement>('#bbs-badge-background-color-picker');
const bbsBadgeBackgroundColorInput = mustElement<HTMLInputElement>('#bbs-badge-background-color');
const bbsBadgeBorderColorPicker = mustElement<HTMLInputElement>('#bbs-badge-border-color-picker');
const bbsBadgeBorderColorInput = mustElement<HTMLInputElement>('#bbs-badge-border-color');
const bbsParserModeInput = mustElement<HTMLSelectElement>('#bbs-parser-mode');
const bbsDatePrefixInput = mustElement<HTMLInputElement>('#bbs-date-prefix');
const bbsTimestampRegexInput = mustElement<HTMLInputElement>('#bbs-timestamp-regex');
const legacyParserFields = mustElement<HTMLDivElement>('#legacy-parser-fields');
const cssParserFields = mustElement<HTMLDivElement>('#css-parser-fields');
const bbsAnchorSelectorInput = mustElement<HTMLInputElement>('#bbs-anchor-selector');
const bbsIdAttributeInput = mustElement<HTMLInputElement>('#bbs-id-attribute');
const bbsHeaderTagInput = mustElement<HTMLInputElement>('#bbs-header-tag');
const bbsNameTagInput = mustElement<HTMLInputElement>('#bbs-name-tag');
const bbsInfoTagInput = mustElement<HTMLInputElement>('#bbs-info-tag');
const bbsBodyContainerTagInput = mustElement<HTMLInputElement>('#bbs-body-container-tag');
const bbsBodyTagInput = mustElement<HTMLInputElement>('#bbs-body-tag');
const bbsPostSelectorInput = mustElement<HTMLInputElement>('#bbs-post-selector');
const bbsPostIdAttributeInput = mustElement<HTMLInputElement>('#bbs-post-id-attribute');
const bbsPostIdPrefixInput = mustElement<HTMLInputElement>('#bbs-post-id-prefix');
const bbsTitleSelectorInput = mustElement<HTMLInputElement>('#bbs-title-selector');
const bbsNameSelectorInput = mustElement<HTMLInputElement>('#bbs-name-selector');
const bbsDateSelectorInput = mustElement<HTMLInputElement>('#bbs-date-selector');
const bbsBodySelectorInput = mustElement<HTMLInputElement>('#bbs-body-selector');
const bbsFormSelectorInput = mustElement<HTMLInputElement>('#bbs-form-selector');
const bbsMethodInput = mustElement<HTMLSelectElement>('#bbs-method');
const bbsSubmitNameInput = mustElement<HTMLInputElement>('#bbs-submit-name');
const bbsSubmitFallbacksInput = mustElement<HTMLInputElement>('#bbs-submit-fallbacks');
const bbsSubmitValueRegexInput = mustElement<HTMLInputElement>('#bbs-submit-value-regex');
const bbsRefererInput = mustElement<HTMLInputElement>('#bbs-referer');

let config: ReaderConfig | null = null;
let enabledSites: SiteConfig[] = [];
let reloadTimer: number | null = null;
let reloadAvailabilityTimer: number | null = null;
let viewingModeTimer: number | null = null;
let requestInFlight = false;
let bbsActionSubmitInFlight = false;
let bbsActionViewPosts: ParsedPost[] = [];
let initializedSites = new Set<string>();
const siteFetchErrors = new Map<string, { siteName: string; message: string }>();
let generalFooterError: string | null = null;
let replyNotificationFooterError: string | null = null;
let replyNotificationUiState: TrackingUiState = { manual: [], automatic: [], error: '' };
const replyNotificationPostKeys = new Set<string>();
const forcedUnreadPostKeys = new Set<string>();
const replyNotificationToggleInFlight = new Set<string>();
const hiddenThreadKeys = new Set<string>();
let threadHideUndoTarget: ResetHiddenThread | null = null;
let threadHideUndoTimer: number | null = null;
let bbsTimelineToastTimer: number | null = null;
let selectedBbsTimelineSiteId: string | null = null;
let notificationSoundDraftPath: string | null = null;
let notificationSoundDraftName: string | null = null;
let notificationSoundResetRequested = false;
let hasScrolledAwayFromTop = false;
let wasAtTop = window.scrollY <= 8;
let readCursor: ReadCursor | null = loadReadCursor();
let textSearchMatches: HTMLElement[] = [];
let textSearchIndex = -1;
let currentPostKey: string | null = null;
const isMacKeyboard = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || /Macintosh|Mac OS X/i.test(navigator.userAgent);
const postsByKey = new Map<string, ParsedPost>();
let savedPosts: SavedPost<ParsedPost>[] = [];
const siteNames = new Map<string, string>();
const siteBaseUrls = new Map<string, string>();
let bbsEditorSites: SiteConfig[] = [];
let selectedBbsIndex = -1;
let bbsSettingsDirty = false;
let savedReaderStyle: ReaderStyleConfig | null = null;
let generalDraftGlobal: GlobalConfig | null = null;
let generalDraftStyle: ReaderStyleConfig | null = null;
let generalSettingsDirty = false;
type SettingsTab = 'general' | 'bbs' | 'config-file' | 'reset' | 'version';
let activeSettingsTab: SettingsTab = 'general';
let ngHandleRegex: RegExp | null = null;
let ngBodyRegex: RegExp | null = null;
let highlightHandleRegex: RegExp | null = null;
let highlightBodyRegex: RegExp | null = null;
const MIN_UNREAD_RELOAD_INTERVAL_SECONDS = 30;
let lastBbsRequestStartedAtMs = 0;
let lastBbsDataFetchedAtMs: number | null = null;

function updateUnreadReloadButton(): void {
  reloadButton.disabled = requestInFlight
    || !canStartUnreadReload(lastBbsDataFetchedAtMs, Date.now());
}

function scheduleUnreadReloadButtonUpdate(): void {
  if (reloadAvailabilityTimer !== null) {
    window.clearTimeout(reloadAvailabilityTimer);
    reloadAvailabilityTimer = null;
  }

  updateUnreadReloadButton();
  if (lastBbsDataFetchedAtMs === null) return;

  const remainingMs = UNREAD_RELOAD_COOLDOWN_MS - (Date.now() - lastBbsDataFetchedAtMs);
  if (remainingMs <= 0) return;

  reloadAvailabilityTimer = window.setTimeout(() => {
    reloadAvailabilityTimer = null;
    scheduleUnreadReloadButtonUpdate();
  }, remainingMs);
}

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element was not found: ${selector}`);
  }
  return element;
}

const visitedUrls = new Set<string>();

function rememberVisitedUrl(url: string): void {
  visitedUrls.add(url);
}

function markExternalElementVisited(element: HTMLElement, url: string): void {
  rememberVisitedUrl(url);
  element.classList.add('link-visited');
}

const plainHttpUrlPattern = /https?:\/\/[^\s<>"']+/gi;
const trailingUrlPunctuationPattern = /[)\]\}）】」』〉》、。！？,.!?;:]+$/u;
const imagePathPattern = /\.(?:avif|apng|bmp|gif|jpe?g|png|webp)$/i;
const imageFormatPattern = /^(?:avif|apng|bmp|gif|jpe?g|png|webp)$/i;

function splitUrlAndTrailingPunctuation(raw: string): { urlText: string; trailing: string } {
  const match = raw.match(trailingUrlPunctuationPattern);
  if (!match) return { urlText: raw, trailing: '' };
  return {
    urlText: raw.slice(0, -match[0].length),
    trailing: match[0],
  };
}

function isLikelyImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (imagePathPattern.test(parsed.pathname)) return true;

    // 例: https://pbs.twimg.com/media/...?...&format=jpg のように
    // 拡張子をquery parameterで指定する画像URLにも対応する。
    for (const key of ['format', 'ext', 'extension']) {
      const format = parsed.searchParams.get(key)?.trim() ?? '';
      if (imageFormatPattern.test(format)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function createExternalLink(url: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = url;
  link.dataset.externalUrl = url;
  link.rel = 'noopener noreferrer';
  link.title = url;
  link.textContent = label;
  if (visitedUrls.has(url)) link.classList.add('link-visited');
  return link;
}


function appendImageDetailLink(imageUrl: string, target: Node): void {
  if (!(config?.global.show_image_detail_link ?? true) || !isLikelyImageUrl(imageUrl)) return;

  const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
  target.appendChild(document.createTextNode('['));

  const detailLink = createExternalLink(lensUrl, '詳');
  detailLink.classList.add('image-detail-link');
  detailLink.title = `Googleレンズで画像を調べる: ${imageUrl}`;
  target.appendChild(detailLink);

  target.appendChild(document.createTextNode(']'));
}

function appendAutoImageThumbnail(url: string, target: Node): void {
  if (!(config?.global.show_post_images ?? false) || !isLikelyImageUrl(url)) return;

  const image = document.createElement('img');
  image.className = 'post-image post-image-thumbnail';
  image.src = url;
  image.alt = '投稿内画像のサムネイル';
  image.title = url;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.dataset.externalUrl = url;
  if (visitedUrls.has(url)) image.classList.add('link-visited');
  target.appendChild(image);
}

function appendTextSegmentWithAutoLinks(text: string, target: Node): void {
  let lastIndex = 0;
  plainHttpUrlPattern.lastIndex = 0;

  for (const match of text.matchAll(plainHttpUrlPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, index)));
    }

    const raw = match[0];
    const { urlText, trailing } = splitUrlAndTrailingPunctuation(raw);
    const href = safeHttpUrl(urlText, undefined);

    if (href) {
      appendAutoImageThumbnail(href, target);
      appendImageDetailLink(href, target);
      target.appendChild(createExternalLink(href, urlText));
    } else {
      target.appendChild(document.createTextNode(urlText));
    }

    if (trailing) target.appendChild(document.createTextNode(trailing));
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendTextWithQuoteStyling(text: string, target: Node, autoLink = false): void {
  const parts = text.split(/(\r\n|\r|\n)/);
  for (const part of parts) {
    if (part === '\r\n' || part === '\r' || part === '\n') {
      target.appendChild(document.createTextNode(part));
      continue;
    }

    if (!part) continue;

    const lineTarget = /^>/.test(part) ? document.createElement('span') : target;
    if (lineTarget instanceof HTMLSpanElement) {
      lineTarget.className = 'post-quote';
      target.appendChild(lineTarget);
    }

    if (autoLink) {
      appendTextSegmentWithAutoLinks(part, lineTarget);
    } else {
      lineTarget.appendChild(document.createTextNode(part));
    }
  }
}

function renderFooterErrors(): void {
  const messages: string[] = [];
  if (generalFooterError) messages.push(generalFooterError);
  if (replyNotificationFooterError) messages.push(`返信通知: ${replyNotificationFooterError}`);
  for (const { siteName, message } of siteFetchErrors.values()) {
    messages.push(`${siteName}: ${message}`);
  }

  const combined = messages.join(' / ');
  const hasError = combined.length > 0;
  footerErrorRow.hidden = !hasError;
  footerErrorElement.textContent = combined;
  footerErrorElement.title = combined;
}

function setFooterError(message: string | null): void {
  const normalized = message?.trim() ?? '';
  generalFooterError = normalized.length > 0 ? normalized : null;
  renderFooterErrors();
}

function setReplyNotificationFooterError(message: string | null): void {
  const normalized = message?.trim() ?? '';
  replyNotificationFooterError = normalized.length > 0 ? normalized : null;
  renderFooterErrors();
}

function syncFixedStatusBarHeight(): void {
  const height = Math.ceil(fixedStatusBar.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--fixed-status-bar-height', `${height}px`);
}

const fixedStatusResizeObserver = new ResizeObserver(syncFixedStatusBarHeight);
fixedStatusResizeObserver.observe(fixedStatusBar);
window.addEventListener('resize', syncFixedStatusBarHeight);
syncFixedStatusBarHeight();

function postKey(post: ParsedPost): string {
  return `${post.site_id}:${post.id}`;
}

function timestampOf(post: ParsedPost): number {
  if (!post.posted_at) return 0;
  const timestamp = Date.parse(post.posted_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestFirst(a: ParsedPost, b: ParsedPost): number {
  const timeDiff = timestampOf(b) - timestampOf(a);
  if (timeDiff !== 0) return timeDiff;
  return postKey(b).localeCompare(postKey(a), 'ja');
}

function newestFirstPosts(): ParsedPost[] {
  return [...postsByKey.values()].sort(compareNewestFirst);
}

function sortedPosts(): ParsedPost[] {
  const posts = filterHiddenThreadPosts(newestFirstPosts(), hiddenThreadKeys);
  if (config?.global.post_order === 'oldest_first') {
    posts.reverse();
  }
  return posts;
}

function multiLinePatternSource(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];
  return lines.map((line) => `(?:${line})`).join('|');
}

function compilePattern(raw: string, global = false): RegExp | null {
  const source = multiLinePatternSource(raw);
  if (!source) return null;
  return new RegExp(source, global ? 'gu' : 'u');
}

function compileNgPattern(raw: string): RegExp | null {
  return compilePattern(raw, false);
}

function compileHighlightPattern(raw: string): RegExp | null {
  return compilePattern(raw, true);
}

function refreshNgWordRegex(globalConfig: GlobalConfig): void {
  try {
    ngHandleRegex = compileNgPattern(globalConfig.ng_handle_patterns ?? '');
  } catch {
    ngHandleRegex = null;
  }
  try {
    ngBodyRegex = compileNgPattern(globalConfig.ng_body_patterns ?? '');
  } catch {
    ngBodyRegex = null;
  }
}

function refreshHighlightRegex(globalConfig: GlobalConfig): void {
  try {
    highlightHandleRegex = compileHighlightPattern(globalConfig.highlight_handle_patterns ?? '');
  } catch {
    highlightHandleRegex = null;
  }
  try {
    highlightBodyRegex = compileHighlightPattern(globalConfig.highlight_body_patterns ?? '');
  } catch {
    highlightBodyRegex = null;
  }
}

function regexMatchesText(regex: RegExp | null, text: string): boolean {
  if (!regex || !text) return false;
  regex.lastIndex = 0;
  const matched = regex.test(text);
  regex.lastIndex = 0;
  return matched;
}

function appendHighlightedText(text: string, target: Node, regex: RegExp | null): void {
  if (!regex || !text) {
    target.appendChild(document.createTextNode(text));
    return;
  }


  const matcher = new RegExp(regex.source, regex.flags);
  let lastIndex = 0;
  let hasMatch = false;
  for (const match of text.matchAll(matcher)) {
    const start = match.index ?? 0;
    const matchedText = match[0];
    if (start > lastIndex) target.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    if (matchedText.length > 0) {
      const mark = document.createElement('span');
      mark.className = 'post-highlight';
      mark.textContent = matchedText;
      target.appendChild(mark);
      hasMatch = true;
    }
    lastIndex = start + matchedText.length;
  }
  if (!hasMatch) {
    target.appendChild(document.createTextNode(text));
    return;
  }
  if (lastIndex < text.length) target.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function applyHighlightToTextNodes(root: HTMLElement, regex: RegExp | null): void {
  if (!regex) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode instanceof Text) nodes.push(walker.currentNode);
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest('.image-detail-link, .post-highlight')) continue;
    if (!regexMatchesText(regex, node.data)) continue;
    const fragment = document.createDocumentFragment();
    appendHighlightedText(node.data, fragment, regex);
    node.replaceWith(fragment);
  }
}

function isNgPost(post: ParsedPost): boolean {
  if (ngHandleRegex) {
    const handleText = `${post.name ?? ''}\n${post.email ?? ''}\n${post.title ?? ''}`;
    if (ngHandleRegex.test(handleText)) return true;
  }
  if (ngBodyRegex && ngBodyRegex.test(post.body_text ?? '')) return true;
  return false;
}

function visibleNewestFirstPosts(): ParsedPost[] {
  return filterHiddenThreadPosts(newestFirstPosts(), hiddenThreadKeys).filter((post) => !isNgPost(post));
}

function mergePosts(posts: ParsedPost[]): void {
  for (const post of posts) {
    postsByKey.set(postKey(post), post);
  }

  // 表示順に関係なく「最新 max_posts 件」を保持し、古いものから捨てる。
  const maxPosts = config?.global.max_posts ?? 666;
  const newest = newestFirstPosts();

  for (const post of newest.slice(maxPosts)) {
    postsByKey.delete(postKey(post));
  }

  persistPostLog();
}

function persistPostLog(): void {
  try {
    savePostLog(
      localStorage,
      POST_LOG_STORAGE_KEY,
      newestFirstPosts(),
      config?.global.max_posts ?? 666,
    );
  } catch {
    // localStorageが使えない環境でも、この起動中の投稿ログは維持する。
  }
}

function loadPostLog(): void {
  try {
    for (const post of parsePostLog<ParsedPost>(localStorage.getItem(POST_LOG_STORAGE_KEY))) {
      postsByKey.set(postKey(post), post);
    }
    mergePosts([]);
  } catch {
    // 保存済み投稿ログを復元できない場合は、空のログとして起動する。
  }
}

function loadSavedPosts(): void {
  try {
    savedPosts = parseSavedPosts<ParsedPost>(localStorage.getItem(SAVED_POSTS_STORAGE_KEY));
  } catch {
    // localStorageが使えない環境では、この起動中の保存済み投稿だけを保持する。
    savedPosts = [];
  }
}

function savePostForLater(post: ParsedPost): void {
  const savedAt = new Date().toISOString();
  try {
    savedPosts = saveSavedPost(localStorage, SAVED_POSTS_STORAGE_KEY, post, savedAt);
  } catch {
    savedPosts = [
      ...savedPosts.filter((savedPost) => postKey(savedPost) !== postKey(post)),
      { ...post, saved_at: savedAt },
    ].sort((left, right) => right.saved_at.localeCompare(left.saved_at, 'ja'));
  }
}

function savePostsForLater(posts: ParsedPost[], treeKey?: string): void {
  const savedAt = new Date().toISOString();
  try {
    savedPosts = treeKey
      ? saveSavedTreePosts(localStorage, SAVED_POSTS_STORAGE_KEY, posts, treeKey, savedAt)
      : saveSavedPosts(localStorage, SAVED_POSTS_STORAGE_KEY, posts, savedAt);
  } catch {
    for (const post of posts) {
      savedPosts = [
        ...savedPosts.filter((savedPost) => postKey(savedPost) !== postKey(post)),
        treeKey ? { ...post, saved_at: savedAt, saved_tree_key: treeKey } : { ...post, saved_at: savedAt },
      ];
    }
    savedPosts.sort((left, right) => right.saved_at.localeCompare(left.saved_at, 'ja'));
  }
}

function deleteSavedPost(siteId: string, postId: string): void {
  try {
    savedPosts = removeSavedPost<ParsedPost>(localStorage, SAVED_POSTS_STORAGE_KEY, siteId, postId);
  } catch {
    savedPosts = savedPosts.filter((post) => post.site_id !== siteId || post.id !== postId);
  }
  renderSavedPosts();
}

function deleteSavedPosts(posts: ParsedPost[]): void {
  try {
    savedPosts = removeSavedPosts(localStorage, SAVED_POSTS_STORAGE_KEY, posts);
  } catch {
    const keys = new Set(posts.map(postKey));
    savedPosts = savedPosts.filter((post) => !keys.has(postKey(post)));
  }
  renderSavedPosts();
}

function toggleCurrentPostSaved(): void {
  if (!(config?.global.post_saving_enabled ?? true)) return;
  const post = getCurrentShortcutPost();
  if (!post) return;

  if (hasSavedPost(savedPosts, post.site_id, post.id)) {
    deleteSavedPost(post.site_id, post.id);
  } else {
    savePostForLater(post);
  }
  updateSaveButtons();
  if (bbsActionView.hidden) renderPosts();
}

function updateSaveButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.post-save-button[data-post-key]').forEach((button) => {
    const saved = savedPosts.some((post) => postKey(post) === button.dataset.postKey);
    button.classList.toggle('is-saved', saved);
    const icon = button.querySelector<HTMLImageElement>('.save-icon');
    if (!icon) return;
    icon.className = `save-icon is-${saved ? 'saved' : 'unsaved'}`;
    icon.src = saved ? SAVE_ICON_FILLED_URL : SAVE_ICON_OUTLINE_URL;
    icon.alt = saved ? '保存済み' : '保存';
    button.title = saved ? 'この投稿を保存済み投稿から削除します' : 'この投稿を保存済み投稿に追加します';
    button.setAttribute('aria-label', button.title);
  });
  document.querySelectorAll<HTMLButtonElement>('.tree-save-button[data-tree-post-keys]').forEach((button) => {
    let postKeys: string[];
    try {
      postKeys = JSON.parse(button.dataset.treePostKeys ?? '[]') as string[];
    } catch {
      return;
    }
    const saved = postKeys.length > 0 && postKeys.every((key) => savedPosts.some((post) => postKey(post) === key));
    button.classList.toggle('is-saved', saved);
    button.textContent = saved ? 'ツリーを保存解除' : 'ツリーを保存';
    button.title = saved ? 'このツリーの投稿を保存済み投稿から削除します' : 'このツリーの投稿を保存済み投稿に追加します';
    button.setAttribute('aria-label', button.title);
  });
}

function loadReadCursor(): ReadCursor | null {
  try {
    const raw = localStorage.getItem(READ_CURSOR_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ReadCursor>;
    if (!Number.isFinite(parsed.timestamp) || typeof parsed.post_key !== 'string' || !parsed.post_key) {
      return null;
    }

    return {
      timestamp: Number(parsed.timestamp),
      post_key: parsed.post_key,
    };
  } catch {
    return null;
  }
}

function saveReadCursor(cursor: ReadCursor): void {
  readCursor = cursor;
  try {
    localStorage.setItem(READ_CURSOR_STORAGE_KEY, JSON.stringify(cursor));
  } catch {
    // localStorageが使えない環境でも、この起動中の既読状態だけは維持する。
  }
}

function cursorFromPost(post: ParsedPost): ReadCursor | null {
  const timestamp = timestampOf(post);
  if (timestamp <= 0) return null;
  return { timestamp, post_key: postKey(post) };
}

/**
 * 既読カーソルよりタイムライン上で新しい投稿を未読とする。
 * 全サイト共通のカーソルなので、新しい順では未読が上側に連続して並ぶ。
 */
function isPostUnread(post: ParsedPost): boolean {
  if (forcedUnreadPostKeys.has(postKey(post))) return true;
  if (!readCursor) return false;

  const timestamp = timestampOf(post);
  if (timestamp <= 0) return false;
  if (timestamp !== readCursor.timestamp) {
    return timestamp > readCursor.timestamp;
  }

  return postKey(post).localeCompare(readCursor.post_key, 'ja') > 0;
}

function unreadCount(posts = visibleNewestFirstPosts()): number {
  return posts.reduce((count, post) => count + (isPostUnread(post) ? 1 : 0), 0);
}

function initializeReadCursorIfNeeded(): void {
  if (readCursor) return;

  const newest = newestFirstPosts()[0];
  if (!newest) return;

  const cursor = cursorFromPost(newest);
  if (cursor) {
    // 初回起動時に既に掲示板にあるログは既読扱い。次回取得以降に増えた投稿だけ未読になる。
    saveReadCursor(cursor);
  }
}

function markAllCurrentPostsRead(): void {
  const newest = newestFirstPosts()[0];
  if (!newest) return;

  const cursor = cursorFromPost(newest);
  if (!cursor) return;

  forcedUnreadPostKeys.clear();
  saveReadCursor(cursor);
  renderPosts();
}

function isAtAppTop(): boolean {
  return window.scrollY <= 8;
}

/**
 * 未読リロードの有無に関係なく、一度画面を下へスクロールしたあとで
 * 最上部へ戻ったときに、その時点の未読投稿を既読にする。
 * 起動直後に最上部にいるだけでは既読化しない。
 */
function handleReadOnTopScroll(): void {
  const atTop = isAtAppTop();

  if (!atTop) {
    hasScrolledAwayFromTop = true;
    wasAtTop = false;
    return;
  }

  const reachedTop = !wasAtTop;
  wasAtTop = true;

  if (!reachedTop || !hasScrolledAwayFromTop) return;

  // 「下へ移動 → 最上部へ戻る」という1回の操作をここで消費する。
  // 未読が0件でもリセットしておくことで、後から新着が来たときに
  // 最上部に居るだけで勝手に既読になるのを防ぐ。
  hasScrolledAwayFromTop = false;

  if (unreadCount() === 0) return;

  markAllCurrentPostsRead();
}


/**
 * 新着が先頭へ追加されても、過去ログを読んでいる最中の視点をずらさないためのアンカー。
 * 一番新しい投稿がまだ画面内に見えている場合は、あえて固定せず新着をその場に出す。
 */
function captureScrollAnchor(): ScrollAnchor | null {
  const articles = Array.from(postsElement.querySelectorAll<HTMLElement>('.post'));
  if (articles.length === 0) return null;

  const firstRect = articles[0].getBoundingClientRect();
  if (firstRect.bottom >= 0) {
    return null;
  }

  for (const article of articles) {
    const rect = article.getBoundingClientRect();
    if (rect.bottom >= 0) {
      const key = article.dataset.postKey;
      if (key) {
        return { postKey: key, viewportTop: rect.top };
      }
    }
  }

  return null;
}

function restoreScrollAnchor(anchor: ScrollAnchor | null): void {
  if (!anchor) return;

  const escapedKey = CSS.escape(anchor.postKey);
  const article = postsElement.querySelector<HTMLElement>(`.post[data-post-key="${escapedKey}"]`);
  if (!article) return;

  const delta = article.getBoundingClientRect().top - anchor.viewportTop;
  if (Math.abs(delta) >= 1) {
    window.scrollBy({ top: delta, behavior: 'instant' });
  }
}

function safeHttpUrl(rawUrl: string, baseUrl: string | undefined): string | null {
  const value = rawUrl.trim();
  if (!value) return null;

  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

const fxTwitterPreviewRequests = new Map<string, Promise<FxTwitterPreview | null>>();

function fetchFxTwitterPreview(statusId: string): Promise<FxTwitterPreview | null> {
  const cached = fxTwitterPreviewRequests.get(statusId);
  if (cached) return cached;

  const request = invoke<unknown>('fetch_fxtwitter_status', { statusId })
    .then(normalizeFxTwitterPreview)
    .catch(() => null);
  fxTwitterPreviewRequests.set(statusId, request);
  return request;
}

function appendFxTwitterPreviewTextLinks(value: string, target: HTMLElement): void {
  for (const part of parseFxTwitterPreviewTextLinks(value)) {
    if (part.url) {
      target.append(createExternalLink(part.url, part.text));
    } else {
      target.append(document.createTextNode(part.text));
    }
  }
}

function buildFxTwitterPreviewCard(preview: FxTwitterPreview): HTMLElement {
  const card = document.createElement('section');
  card.className = 'fxtwitter-preview post-copy-exclusion';

  const header = document.createElement('div');
  header.className = 'fxtwitter-preview-header';
  const authorLabel = preview.authorName || 'Xの投稿';
  if (preview.authorHandle) {
    header.append(createExternalLink(
      `https://x.com/${encodeURIComponent(preview.authorHandle)}`,
      authorLabel,
    ));
  } else {
    const author = document.createElement('strong');
    author.textContent = authorLabel;
    header.append(author);
  }
  if (preview.authorHandle) {
    const handle = document.createElement('span');
    handle.textContent = `@${preview.authorHandle}`;
    header.append(handle);
  }
  const text = document.createElement('p');
  text.className = 'fxtwitter-preview-text';
  const truncatedText = truncateFxTwitterPreviewText(preview.text);
  let expanded = false;
  const renderText = (): void => {
    const value = expanded ? preview.text : truncatedText.text;
    text.replaceChildren();
    appendFxTwitterPreviewTextLinks(value, text);
    text.setAttribute('aria-expanded', String(expanded));
  };
  renderText();
  if (truncatedText.truncated) {
    text.classList.add('is-expandable');
    text.tabIndex = 0;
    text.setAttribute('role', 'button');
    text.title = 'クリックして全文を表示';
    const toggleText = (): void => {
      expanded = !expanded;
      renderText();
      text.title = expanded ? 'クリックして省略表示に戻す' : 'クリックして全文を表示';
    };
    text.addEventListener('click', toggleText);
    text.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleText();
    });
  }
  card.append(header, text);

  if (config?.global.show_post_images ?? false) {
    const media = document.createElement('div');
    media.className = 'fxtwitter-preview-media';
    for (const rawUrl of preview.photoUrls) {
      const imageUrl = safeHttpUrl(rawUrl, undefined);
      if (!imageUrl) continue;
      const image = document.createElement('img');
      image.className = 'post-image post-image-thumbnail fxtwitter-preview-photo';
      image.src = imageUrl;
      image.alt = 'X投稿の添付画像';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.dataset.externalUrl = imageUrl;
      media.append(image);
    }
    const statusUrl = safeHttpUrl(preview.statusUrl, undefined);
    for (const source of preview.videos) {
      const posterUrl = safeHttpUrl(source.thumbnailUrl, undefined);
      if (!posterUrl) continue;
      const thumbnail = document.createElement('img');
      thumbnail.className = 'fxtwitter-preview-video-thumbnail';
      thumbnail.src = posterUrl;
      thumbnail.alt = 'X投稿の添付動画のサムネイル';
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      thumbnail.referrerPolicy = 'no-referrer';

      if (!statusUrl) {
        media.append(thumbnail);
        continue;
      }
      const link = createExternalLink(statusUrl, '');
      link.className = 'fxtwitter-preview-video-link';
      link.title = 'Xで動画を見る';
      const label = document.createElement('span');
      label.className = 'fxtwitter-preview-video-label';
      label.textContent = 'Xで動画を見る';
      link.append(thumbnail, label);
      media.append(link);
    }
    if (media.childElementCount > 0) card.append(media);
  }

  return card;
}

function appendFxTwitterPreviews(body: HTMLElement): void {
  if (!(config?.global.show_fxtwitter_previews ?? false)) return;

  const seenStatusIds = new Set<string>();
  for (const link of Array.from(body.querySelectorAll<HTMLAnchorElement>('a[data-external-url]'))) {
    const reference = parseFxTwitterStatusUrl(link.href);
    if (!reference || seenStatusIds.has(reference.id)) continue;
    seenStatusIds.add(reference.id);

    const loading = document.createElement('span');
    loading.className = 'fxtwitter-preview-loading post-copy-exclusion';
    loading.textContent = 'X投稿を読み込み中…';
    link.after(loading);

    void fetchFxTwitterPreview(reference.id).then((preview) => {
      if (!preview || !loading.isConnected) {
        loading.remove();
        return;
      }
      loading.replaceWith(buildFxTwitterPreviewCard(preview));
    });
  }
}

function appendYouTubePreviews(body: HTMLElement): void {
  if (!(config?.global.show_youtube_previews ?? false)) return;

  const seenVideoIds = new Set<string>();
  for (const link of Array.from(body.querySelectorAll<HTMLAnchorElement>('a[data-external-url]'))) {
    const reference = parseYouTubeVideoUrl(link.href);
    if (!reference || seenVideoIds.has(reference.id)) continue;
    seenVideoIds.add(reference.id);

    const preview = document.createElement('section');
    preview.className = 'youtube-preview post-copy-exclusion';
    const playLink = document.createElement('a');
    playLink.className = 'youtube-preview-link';
    playLink.href = reference.url;
    playLink.dataset.externalUrl = reference.url;
    playLink.title = 'YouTubeで動画を再生';
    const thumbnail = document.createElement('img');
    thumbnail.className = 'youtube-preview-thumbnail';
    thumbnail.src = buildYouTubeThumbnailUrl(reference.id);
    thumbnail.alt = 'YouTube動画のサムネイル';
    thumbnail.loading = 'lazy';
    thumbnail.decoding = 'async';
    thumbnail.referrerPolicy = 'no-referrer';
    const label = document.createElement('span');
    label.className = 'youtube-preview-play-label';
    label.textContent = 'YouTubeで再生';
    playLink.append(thumbnail, label);
    preview.append(playLink);
    link.after(preview);
  }
}

const droppedHtmlTags = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'FRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'META',
  'LINK',
  'BASE',
  'VIDEO',
  'AUDIO',
  'SOURCE',
  'IMG',
]);

const preservedInlineTags = new Map<string, string>([
  ['B', 'b'],
  ['STRONG', 'strong'],
  ['I', 'i'],
  ['EM', 'em'],
  ['U', 'u'],
  ['S', 's'],
  ['STRIKE', 's'],
  ['SMALL', 'small'],
  ['BIG', 'span'],
  ['CODE', 'code'],
]);

/**
 * 掲示板由来HTMLは直接 innerHTML に入れない。
 * 新しいDOMをこちらで作り、テキスト・改行・最低限の装飾・安全なHTTP(S)リンクだけを残す。
 */
function appendSanitizedNodes(
  source: Node,
  target: Node,
  baseUrl: string | undefined,
  siteId: string | undefined,
): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      appendTextWithQuoteStyling(child.textContent ?? '', target, child.parentElement?.tagName !== 'A');
      continue;
    }

    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const tagName = child.tagName.toUpperCase();
    if (droppedHtmlTags.has(tagName)) {
      continue;
    }

    if (tagName === 'BR') {
      target.appendChild(document.createElement('br'));
      continue;
    }

    if (tagName === 'A') {
      const href = safeHttpUrl(child.getAttribute('href') ?? '', baseUrl);
      const element = href ? document.createElement('a') : document.createElement('span');

      if (href && element instanceof HTMLAnchorElement) {
        element.href = href;
        if (isReferencePostLink(child.textContent ?? '')) {
          element.dataset.bbsActionHref = href;
          if (siteId) element.dataset.bbsActionSiteId = siteId;
          element.dataset.bbsActionKind = 'follow';
          element.title = 'フォロー投稿画面を未読菩薩で表示';
          element.setAttribute('aria-label', element.title);
        } else {
          element.dataset.externalUrl = href;
          element.rel = 'noopener noreferrer';
          element.title = href;
          if (visitedUrls.has(href)) element.classList.add('link-visited');
        }
      }

      appendSanitizedNodes(child, element, baseUrl, siteId);

      // 画像URLの場合は「サムネイル [詳] URL」の順に並べる。
      if (href) appendAutoImageThumbnail(href, target);
      if (href) appendImageDetailLink(href, target);
      target.appendChild(element);
      continue;
    }

    const preservedTag = preservedInlineTags.get(tagName);
    if (preservedTag) {
      const element = document.createElement(preservedTag);
      appendSanitizedNodes(child, element, baseUrl, siteId);
      target.appendChild(element);
      continue;
    }

    // FONT/SPAN/DIV等は属性を一切引き継がず、中身だけ残す。
    appendSanitizedNodes(child, target, baseUrl, siteId);
  }
}

function isCompactBodySeparator(node: Node): boolean {
  if (node instanceof HTMLBRElement) return true;
  return node.nodeType === Node.TEXT_NODE && /^[\s\r\n]*$/.test(node.textContent ?? '');
}

function trimCompactBodyStart(body: HTMLElement): void {
  while (body.firstChild && isCompactBodySeparator(body.firstChild)) {
    body.firstChild.remove();
  }
}

function trimCompactBodyEnd(body: HTMLElement): void {
  while (body.lastChild && isCompactBodySeparator(body.lastChild)) {
    body.lastChild.remove();
  }
}

function isTreeQuoteLineSeparator(node: Node): boolean {
  if (node instanceof HTMLBRElement) return true;
  return node.nodeType === Node.TEXT_NODE && /[\r\n]/.test(node.textContent ?? '');
}

function removeTreeQuoteLine(body: HTMLElement, quote: HTMLElement): void {
  // 引用本文内のURLはサニタイズ時にサムネイル・[詳]・A要素へ分割される。
  // .post-quote だけではURL側が残るため、引用開始位置から行末までをまとめて削除する。
  let lineNode: Node = quote;
  while (lineNode.parentNode && lineNode.parentNode !== body) {
    lineNode = lineNode.parentNode;
  }
  if (lineNode.parentNode !== body) return;

  let node: Node | null = lineNode;
  while (node) {
    const next: Node | null = node.nextSibling;
    const reachedLineEnd = isTreeQuoteLineSeparator(node);
    node.parentNode?.removeChild(node);
    if (reachedLineEnd) break;
    node = next;
  }
}

function compactTreeQuotedArea(body: HTMLElement): void {
  // ツリー表示では親子関係そのものが文脈になるため、本文中の引用行はすべて省略する。
  // URL・サムネイル・[詳] が引用行に含まれる場合も行全体を消す。
  for (const quote of Array.from(body.querySelectorAll<HTMLElement>('.post-quote'))) {
    if (!body.contains(quote)) continue;
    removeTreeQuoteLine(body, quote);
  }
  trimCompactBodyStart(body);
  trimCompactBodyEnd(body);

  // 親子関係の判定に使う末尾の「参考：…」リンクもツリー上では重複情報なので省略する。
  const referenceLinks = Array.from(body.querySelectorAll<HTMLAnchorElement>('a'))
    .filter((link) => /^\s*参考[：:]/u.test(link.textContent ?? ''));
  const lastReference = referenceLinks.at(-1);
  if (lastReference) {
    let node: Node | null = lastReference.nextSibling;
    let hasMeaningfulAfter = false;
    while (node) {
      if (!isCompactBodySeparator(node)) {
        hasMeaningfulAfter = true;
        break;
      }
      node = node.nextSibling;
    }
    if (!hasMeaningfulAfter && lastReference.parentElement === body) {
      lastReference.remove();
      trimCompactBodyEnd(body);
    }
  }

  removeTreeEmptyLines(body);
}

function buildSafePostBody(post: ParsedPost, compactTreeQuotes = false): HTMLElement {
  const body = document.createElement('div');
  body.className = compactTreeQuotes ? 'post-body post-body-tree-compact' : 'post-body';

  // DOMParser(text/html) の代わりに inert な template.content で解析する。
  // 掲示板HTML中のIMGタグは droppedHtmlTags で破棄し、画像URLだけをサムネイル候補にする。
  const template = document.createElement('template');
  template.innerHTML = post.body_html;
  const baseUrl = siteBaseUrls.get(post.site_id);
  appendSanitizedNodes(template.content, body, baseUrl, post.site_id);

  if (config?.global.expand_numeric_character_references ?? false) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    for (const textNode of textNodes) textNode.nodeValue = expandNumericCharacterReferences(textNode.nodeValue ?? '');
  }

  // 壊れたHTML等で何も残らなかった場合は必ずテキストへfallbackする。
  if (!body.hasChildNodes() && post.body_text) {
    appendTextWithQuoteStyling(post.body_text, body, true);
  }

  if (compactTreeQuotes) compactTreeQuotedArea(body);
  applyHighlightToTextNodes(body, highlightBodyRegex);
  appendFxTwitterPreviews(body);
  appendYouTubePreviews(body);
  return body;
}

function buildUnreadBoundary(count: number, newestFirst: boolean): HTMLElement {
  const divider = document.createElement('div');
  divider.id = 'unread-boundary';
  divider.className = 'unread-boundary';
  divider.setAttribute('role', 'separator');

  const label = document.createElement('span');
  label.textContent = newestFirst
    ? `未読ここまで · ${count}件`
    : `ここから未読 · ${count}件`;
  divider.append(label);

  return divider;
}

function updateUnreadControls(posts: ParsedPost[]): void {
  const count = unreadCount(posts);
  const label = count > 0 ? `未読境界へ (${count})` : '未読境界へ';
  for (const button of [timelineUnreadJumpButton, unreadJumpButton]) {
    button.disabled = count === 0;
    button.textContent = label;
  }
}

function renderReplyNotificationBanner(): void {
  if (!(config?.global.reply_notification_enabled ?? false)) {
    replyNotificationPostKeys.clear();
    replyNotificationBannerRow.hidden = true;
    threadHideUndoToast.classList.remove('is-above-reply-notification');
    return;
  }
  const hasUnreadReply = newestFirstPosts().some((post) => (
    replyNotificationPostKeys.has(postKey(post)) && isPostUnread(post)
  ));
  if (!hasUnreadReply) replyNotificationPostKeys.clear();
  replyNotificationBannerRow.hidden = !hasUnreadReply;
  threadHideUndoToast.classList.toggle('is-above-reply-notification', hasUnreadReply);
}

function applyReplyNotificationPostPresentation(
  article: HTMLElement,
  meta: HTMLElement,
  post: ParsedPost,
  unread: boolean,
): void {
  const presentation = replyNotificationPostPresentation(
    unread,
    replyNotificationPostKeys.has(postKey(post)),
  );
  article.classList.toggle('post-reply-notification', presentation.highlighted);
  if (!presentation.badge_label) return;

  const badge = document.createElement('span');
  badge.className = 'reply-notification-badge post-copy-exclusion';
  badge.textContent = presentation.badge_label;
  meta.append(badge);
}

function jumpToOldestUnreadReplyNotification(): void {
  const targetKey = chooseOldestUnreadReplyPostKey(
    newestFirstPosts()
      .filter((post) => replyNotificationPostKeys.has(postKey(post)))
      .map((post) => ({
        post_key: postKey(post),
        unread: isPostUnread(post),
        timestamp: timestampOf(post),
      })),
  );
  if (!targetKey) return;

  const article = Array.from(postsElement.querySelectorAll<HTMLElement>('article.post[data-post-key]'))
    .find((element) => element.dataset.postKey === targetKey);
  article?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeTextSearchHighlights(): void {
  const marks = Array.from(currentTextSearchRoot().querySelectorAll<HTMLElement>('mark.text-search-match'));
  for (const mark of marks) {
    const parent = mark.parentNode;
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''));
    parent?.normalize();
  }
  textSearchMatches = [];
}

function currentTextSearchRoot(): HTMLElement {
  return textSearchRoot(postsElement, savedPostsView, savedPostsViewContent);
}

function updateTextSearchCount(errorMessage = ''): void {
  const total = textSearchMatches.length;
  const current = total > 0 && textSearchIndex >= 0 ? textSearchIndex + 1 : 0;
  textSearchCount.classList.toggle('is-error', Boolean(errorMessage));
  textSearchCount.textContent = errorMessage ? '正規表現エラー' : `${current} / ${total}`;
  textSearchCount.title = errorMessage;
  textSearchPrevButton.disabled = total === 0 || Boolean(errorMessage);
  textSearchNextButton.disabled = total === 0 || Boolean(errorMessage);
}

function setCurrentTextSearchMatch(index: number, scrollIntoView: boolean): void {
  for (const match of textSearchMatches) match.classList.remove('is-current');

  if (textSearchMatches.length === 0) {
    textSearchIndex = -1;
    updateTextSearchCount();
    return;
  }

  textSearchIndex = ((index % textSearchMatches.length) + textSearchMatches.length) % textSearchMatches.length;
  const current = textSearchMatches[textSearchIndex];
  current.classList.add('is-current');
  updateTextSearchCount();

  if (scrollIntoView) {
    current.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

type TextSearchRange = {
  start: number;
  end: number;
};

function literalTextSearchRanges(text: string, query: string): TextSearchRange[] {
  const ranges: TextSearchRange[] = [];
  const normalized = text.toLocaleLowerCase('ja-JP');
  const normalizedQuery = query.toLocaleLowerCase('ja-JP');
  let searchFrom = 0;
  let matchIndex = normalized.indexOf(normalizedQuery, searchFrom);

  while (matchIndex >= 0) {
    ranges.push({ start: matchIndex, end: matchIndex + query.length });
    searchFrom = matchIndex + query.length;
    matchIndex = normalized.indexOf(normalizedQuery, searchFrom);
  }

  return ranges;
}

function regexTextSearchRanges(text: string, source: string): TextSearchRange[] {
  const ranges: TextSearchRange[] = [];
  const regex = new RegExp(source, 'giu');
  let match = regex.exec(text);

  while (match) {
    const matchedText = match[0];
    if (matchedText.length > 0) {
      ranges.push({ start: match.index, end: match.index + matchedText.length });
    } else if (regex.lastIndex <= match.index) {
      // 0文字一致する正規表現で無限ループしないよう、1コードユニット進める。
      regex.lastIndex = match.index + 1;
    }
    match = regex.exec(text);
  }

  return ranges;
}

function collectTextSearchMatches(query: string, useRegex: boolean): HTMLElement[] {
  if (!query) return [];

  // 先に構文だけ検証して、DOMの一部を書き換えた後で例外にならないようにする。
  if (useRegex) new RegExp(query, 'giu');

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(currentTextSearchRoot(), NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (
      node instanceof Text
      && node.data.length > 0
      && node.parentElement?.closest('.post-subject, .post-name, .post-body')
    ) {
      textNodes.push(node);
    }
    node = walker.nextNode();
  }

  const matches: HTMLElement[] = [];

  for (const textNode of textNodes) {
    const original = textNode.data;
    const ranges = useRegex
      ? regexTextSearchRanges(original, query)
      : literalTextSearchRanges(original, query);
    if (ranges.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) {
        fragment.appendChild(document.createTextNode(original.slice(cursor, range.start)));
      }

      const mark = document.createElement('mark');
      mark.className = 'text-search-match';
      mark.textContent = original.slice(range.start, range.end);
      fragment.appendChild(mark);
      matches.push(mark);
      cursor = range.end;
    }

    if (cursor < original.length) {
      fragment.appendChild(document.createTextNode(original.slice(cursor)));
    }
    textNode.replaceWith(fragment);
  }

  return matches;
}

function refreshTextSearch(resetIndex = false, scrollIntoView = false): void {
  const previousIndex = textSearchIndex;
  removeTextSearchHighlights();

  const query = textSearchInput.value;
  if (!query) {
    textSearchIndex = -1;
    updateTextSearchCount();
    return;
  }

  try {
    textSearchMatches = collectTextSearchMatches(query, textSearchRegexInput.checked);
  } catch (error: unknown) {
    textSearchMatches = [];
    textSearchIndex = -1;
    const detail = error instanceof Error ? error.message : String(error);
    updateTextSearchCount(detail);
    return;
  }

  if (textSearchMatches.length === 0) {
    textSearchIndex = -1;
    updateTextSearchCount();
    return;
  }

  const nextIndex = resetIndex || previousIndex < 0
    ? 0
    : Math.min(previousIndex, textSearchMatches.length - 1);
  setCurrentTextSearchMatch(nextIndex, scrollIntoView);
}

function openTextSearch(): void {
  textSearchBar.classList.toggle('is-over-saved-posts-view', !savedPostsView.hidden);
  textSearchBar.hidden = false;
  refreshTextSearch(false, false);
  textSearchInput.focus();
  textSearchInput.select();
}

function closeTextSearch(): void {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && textSearchBar.contains(activeElement)) activeElement.blur();
  textSearchBar.hidden = true;
  removeTextSearchHighlights();
  textSearchIndex = -1;
  updateTextSearchCount();
}

function moveTextSearch(delta: number): void {
  if (textSearchMatches.length === 0) {
    refreshTextSearch(true, true);
    return;
  }
  setCurrentTextSearchMatch(textSearchIndex + delta, true);
}

function isTextSearchShortcut(event: KeyboardEvent): boolean {
  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f') return false;
  return isMacKeyboard
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}


type BbsActionKind = 'follow' | 'thread' | 'tree';

function actionUrlForPost(post: ParsedPost, kind: BbsActionKind): string | null {
  return kind === 'follow' ? post.follow_url : post.thread_url;
}

function closePostContextMenu(): void {
  postContextMenu.hidden = true;
  postContextMenu.replaceChildren();
}

function contextMenuLabel(action: PostContextMenuItem, post: ParsedPost): string {
  if (action === 'copy') return 'コピー';
  if (action === 'follow') return 'フォロー投稿';
  if (action === 'thread') return 'スレッド表示';
  if (action === 'tree') return 'スレッドをツリー表示';
  if (action === 'hide_thread') return 'このスレッドを非表示にする';
  if (action === 'reply_notification') {
    const mode = notificationButtonMode(replyNotificationUiState, post.site_id, post.id);
    return mode === 'manual' ? 'この投稿のレスの通知を解除する' : 'この投稿のレスを通知する';
  }
  return hasSavedPost(savedPosts, post.site_id, post.id) ? 'この投稿の保存を解除する' : 'この投稿を保存する';
}

function runPostContextMenuAction(action: PostContextMenuItem, post: ParsedPost): void {
  closePostContextMenu();
  if (action === 'copy') {
    void copyPostToClipboard(post);
    return;
  }
  if (action === 'follow' || action === 'thread' || action === 'tree') {
    const href = actionUrlForPost(post, action);
    if (href) void openBbsActionView(post.site_id, href, action);
    return;
  }
  if (action === 'hide_thread') {
    void hideThread(post);
    return;
  }
  if (action === 'reply_notification') {
    const mode = notificationButtonMode(replyNotificationUiState, post.site_id, post.id);
    if (mode !== 'automatic') void setPostManualNotification(post, mode !== 'manual');
    return;
  }
  if (hasSavedPost(savedPosts, post.site_id, post.id)) {
    deleteSavedPost(post.site_id, post.id);
  } else {
    savePostForLater(post);
  }
  updateSaveButtons();
  if (bbsActionView.hidden) renderPosts();
}

function pointerIsOverPostText(event: MouseEvent, target: Element): boolean {
  if (target.closest('a, button, .site-badge, .unread-badge')) return false;
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return false;

  const text = range.startContainer.textContent ?? '';
  const offsets = [range.startOffset, range.startOffset - 1]
    .filter((offset) => offset >= 0 && offset < text.length && text[offset].trim().length > 0);
  const rects = offsets.flatMap((offset) => {
    const characterRange = document.createRange();
    characterRange.setStart(range.startContainer, offset);
    characterRange.setEnd(range.startContainer, offset + 1);
    return Array.from(characterRange.getClientRects());
  });
  return pointerHitsTextRect(event.clientX, event.clientY, rects);
}

function pointerIsOverPostUrl(target: Element): boolean {
  return target.closest('.post-body a[href]') !== null;
}

function openPostContextMenu(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!shouldOpenPostContextMenu(pointerIsOverPostText(event, target), pointerIsOverPostUrl(target))) {
    closePostContextMenu();
    return;
  }
  const article = target.closest<HTMLElement>('article.post[data-post-key]');
  const key = article?.dataset.postKey;
  if (!key) return;
  const post = postsByKey.get(key)
    ?? bbsActionViewPosts.find((candidate) => postKey(candidate) === key)
    ?? savedPosts.find((candidate) => postKey(candidate) === key);
  if (!post) return;

  const entries = postContextMenuEntries({
    has_follow_url: Boolean(post.follow_url),
    has_thread_url: Boolean(post.thread_url),
    thread_hiding_enabled: !(config?.global.hide_thread_hide_link ?? false),
    reply_notification_enabled: config?.global.reply_notification_enabled ?? false,
    post_saving_enabled: config?.global.post_saving_enabled ?? true,
  });
  if (entries.length === 0) return;

  event.preventDefault();
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    if (entry === 'separator') {
      const separator = document.createElement('hr');
      separator.className = 'post-context-menu-separator';
      separator.setAttribute('role', 'separator');
      fragment.append(separator);
      continue;
    }
    const action = entry;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = contextMenuLabel(action, post);
    if (action === 'reply_notification'
      && notificationButtonMode(replyNotificationUiState, post.site_id, post.id) === 'automatic') {
      button.disabled = true;
    }
    button.addEventListener('click', () => runPostContextMenuAction(action, post));
    fragment.append(button);
  }
  postContextMenu.replaceChildren(fragment);
  postContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 260)}px`;
  postContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 280)}px`;
  postContextMenu.hidden = false;
  postContextMenu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}

function createPostActionLink(post: ParsedPost, kind: BbsActionKind): HTMLAnchorElement | null {
  const href = actionUrlForPost(post, kind);
  if (!href) return null;

  const link = document.createElement('a');
  link.className = 'post-action-link';
  link.href = href;
  link.dataset.bbsActionHref = href;
  link.dataset.bbsActionSiteId = post.site_id;
  link.dataset.bbsActionKind = kind;
  link.textContent = kind === 'follow' ? '■' : kind === 'tree' ? '木' : '◆';
  link.title = kind === 'follow'
    ? 'フォロー投稿画面を未読菩薩で表示'
    : kind === 'tree'
      ? 'スレッドを未読菩薩でツリー表示'
      : 'スレッドを未読菩薩で表示';
  link.setAttribute('aria-label', link.title);
  return link;
}

function appendPostActionLinks(post: ParsedPost, target: HTMLElement): void {
  const follow = createPostActionLink(post, 'follow');
  const thread = createPostActionLink(post, 'thread');
  if (!follow && !thread) return;

  const wrapper = document.createElement('span');
  wrapper.className = 'post-action-links';
  if (follow) {
    wrapper.append(document.createTextNode('　'), follow);
  }
  if (thread) {
    wrapper.append(document.createTextNode('　'), thread);
  }
  const treeLinkVisible = shouldShowThreadTreeLink(
    config?.global.tree_view_enabled ?? false,
    post.thread_url,
    config?.global.hide_tree_link ?? false,
  );
  const hideLinkVisible = shouldShowThreadHideLink(
    post.thread_url,
    config?.global.hide_thread_hide_link ?? false,
  );
  if (treeLinkVisible || hideLinkVisible) {
    const tree = createPostActionLink(post, 'tree');
    if (tree && treeLinkVisible) {
      const treeCopyExclusion = document.createElement('span');
      treeCopyExclusion.className = 'post-copy-exclusion';
      treeCopyExclusion.append(document.createTextNode('　'), tree);
      wrapper.append(treeCopyExclusion);
    }
    if (hideLinkVisible) {
      const hideCopyExclusion = document.createElement('span');
      hideCopyExclusion.className = 'post-copy-exclusion';
      hideCopyExclusion.append(document.createTextNode('　'), createThreadHideLink(post));
      wrapper.append(hideCopyExclusion);
    }
  }
  target.append(wrapper);
}

function createThreadHideLink(post: ParsedPost): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'post-action-link thread-hide-link';
  link.textContent = '消';
  link.title = 'このスレッドを返信を含めて7日間非表示にする';
  link.setAttribute('aria-label', link.title);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void hideThread(post);
  });
  return link;
}

async function refreshHiddenThreadKeys(): Promise<void> {
  const keys = await invoke<string[]>('get_hidden_thread_keys');
  hiddenThreadKeys.clear();
  keys.forEach((key) => hiddenThreadKeys.add(key));
}

async function hideThread(post: ParsedPost): Promise<void> {
  const threadKey = threadVisibilityKey(post);
  const separator = threadKey.indexOf(':');
  const threadId = separator >= 0 ? threadKey.slice(separator + 1) : post.id;
  try {
    const keys = await invoke<string[]>('hide_thread', {
      siteId: post.site_id,
      threadId,
    });
    hiddenThreadKeys.clear();
    keys.forEach((key) => hiddenThreadKeys.add(key));
    if (!bbsActionView.hidden) closeBbsActionView();
    renderPosts();
    if (!savedPostsView.hidden) renderSavedPosts();
    showThreadHideUndoToast({
      site_id: post.site_id,
      thread_id: threadId,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    setFooterError(`スレッドを非表示にできませんでした: ${String(error)}`);
  }
}

function showThreadHideUndoToast(thread: ResetHiddenThread): void {
  if (threadHideUndoTimer !== null) window.clearTimeout(threadHideUndoTimer);
  threadHideUndoTarget = thread;
  threadHideUndoButton.disabled = false;
  threadHideUndoToast.hidden = false;
  threadHideUndoTimer = window.setTimeout(() => {
    threadHideUndoTarget = null;
    threadHideUndoToast.hidden = true;
    threadHideUndoTimer = null;
  }, 5000);
}

function hideThreadHideUndoToast(): void {
  if (threadHideUndoTimer !== null) window.clearTimeout(threadHideUndoTimer);
  threadHideUndoTimer = null;
  threadHideUndoTarget = null;
  threadHideUndoToast.hidden = true;
}

async function undoThreadHide(): Promise<void> {
  const thread = threadHideUndoTarget;
  if (!thread) return;

  threadHideUndoButton.disabled = true;
  try {
    await invoke('remove_hidden_threads', { targets: [thread] });
    await refreshHiddenThreadKeys();
    hideThreadHideUndoToast();
    if (!bbsActionView.hidden) closeBbsActionView();
    renderPosts();
    if (!savedPostsView.hidden) renderSavedPosts();
  } catch (error) {
    threadHideUndoButton.disabled = false;
    setFooterError(`スレッドの非表示を戻せませんでした: ${String(error)}`);
  }
}

threadHideUndoButton.addEventListener('click', () => {
  void undoThreadHide();
});

function createReplyNotificationButton(post: ParsedPost): HTMLButtonElement | null {
  if (!(config?.global.reply_notification_enabled ?? false)) return null;

  const key = trackingKey(post.site_id, post.id);
  const mode = notificationButtonMode(replyNotificationUiState, post.site_id, post.id);
  const viewModel = notificationButtonViewModel(mode);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `post-notification-button is-${mode}`;
  const icon = document.createElement('img');
  icon.className = `notification-icon is-${mode}`;
  icon.src = mode === 'off' ? NOTIFICATION_ICON_URL : NOTIFICATION_ICON_ACTIVE_URL;
  icon.alt = viewModel.label;
  button.append(icon);
  button.title = mode === 'automatic'
    ? '未読菩薩から投稿したため自動で返信を追跡中です'
    : mode === 'manual'
      ? 'クリックすると返信通知の追跡を解除します'
      : 'クリックするとこの投稿への返信を通知します';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(viewModel.pressed));
  button.dataset.notificationSiteId = post.site_id;
  button.dataset.notificationPostId = post.id;
  button.disabled = viewModel.disabled || replyNotificationToggleInFlight.has(key);

  if (!viewModel.disabled) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentMode = notificationButtonMode(replyNotificationUiState, post.site_id, post.id);
      void setPostManualNotification(post, currentMode !== 'manual');
    });
  }
  return button;
}

function updateNotificationButtons(): void {
  const enabled = config?.global.reply_notification_enabled ?? false;
  document.querySelectorAll<HTMLButtonElement>('.post-notification-button').forEach((button) => {
    if (!enabled) {
      button.remove();
      return;
    }
    const siteId = button.dataset.notificationSiteId ?? '';
    const postId = button.dataset.notificationPostId ?? '';
    if (!siteId || !postId) return;
    const key = trackingKey(siteId, postId);
    const mode = notificationButtonMode(replyNotificationUiState, siteId, postId);
    const viewModel = notificationButtonViewModel(mode);
    button.className = `post-notification-button is-${mode}`;
    const icon = button.querySelector<HTMLImageElement>('.notification-icon');
    if (icon) {
      icon.className = `notification-icon is-${mode}`;
      icon.src = mode === 'off' ? NOTIFICATION_ICON_URL : NOTIFICATION_ICON_ACTIVE_URL;
      icon.alt = viewModel.label;
    }
    button.title = mode === 'automatic'
      ? '未読菩薩から投稿したため自動で返信を追跡中です'
      : mode === 'manual'
        ? 'クリックすると返信通知の追跡を解除します'
        : 'クリックするとこの投稿への返信を通知します';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(viewModel.pressed));
    button.disabled = viewModel.disabled || replyNotificationToggleInFlight.has(key);
  });
}

async function refreshReplyNotificationUiState(): Promise<void> {
  try {
    const state = await invoke<TrackingUiState>('get_reply_notification_ui_state');
    replyNotificationUiState = state;
    setReplyNotificationFooterError(state.error?.trim() || null);
    updateNotificationButtons();
  } catch (error) {
    setReplyNotificationFooterError(`追跡状態の取得に失敗しました: ${String(error)}`);
  }
}

async function setPostManualNotification(post: ParsedPost, enabled: boolean): Promise<void> {
  const key = trackingKey(post.site_id, post.id);
  if (replyNotificationToggleInFlight.has(key)) return;

  replyNotificationToggleInFlight.add(key);
  updateNotificationButtons();
  try {
    const baselinePostIds = enabled
      ? knownDescendantPostIds(post.site_id, post.id, [...postsByKey.values(), ...bbsActionViewPosts])
      : [];
    const state = await invoke<TrackingUiState>('set_manual_reply_tracking', {
      siteId: post.site_id,
      postId: post.id,
      enabled,
      baselinePostIds,
    });
    replyNotificationUiState = state;
    setReplyNotificationFooterError(state.error?.trim() || null);
    renderPosts();
    updateNotificationButtons();
  } catch (error) {
    setReplyNotificationFooterError(`通知追跡の変更に失敗しました: ${String(error)}`);
  } finally {
    replyNotificationToggleInFlight.delete(key);
    updateNotificationButtons();
  }
}

function createSavePostButton(post: ParsedPost): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'post-save-button';
  button.dataset.postKey = postKey(post);
  const updateButton = (): void => {
    const saved = hasSavedPost(savedPosts, post.site_id, post.id);
    button.classList.toggle('is-saved', saved);
    const icon = document.createElement('img');
    icon.className = `save-icon is-${saved ? 'saved' : 'unsaved'}`;
    icon.src = saved ? SAVE_ICON_FILLED_URL : SAVE_ICON_OUTLINE_URL;
    icon.alt = saved ? '保存済み' : '保存';
    button.replaceChildren(icon);
    button.title = saved ? 'この投稿を保存済み投稿から削除します' : 'この投稿を保存済み投稿に追加します';
    button.setAttribute('aria-label', button.title);
  };
  updateButton();
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (hasSavedPost(savedPosts, post.site_id, post.id)) {
      deleteSavedPost(post.site_id, post.id);
    } else {
      savePostForLater(post);
    }
    updateButton();
  });
  return button;
}

function buildPostDateActions(post: ParsedPost, includeNotification = true): HTMLElement {
  const dateActions = document.createElement('span');
  dateActions.className = 'post-date-actions';

  const time = document.createElement('time');
  time.className = 'post-time';
  time.textContent = post.posted_at_raw || '-';
  if (post.posted_at) time.dateTime = post.posted_at;

  dateActions.append(time);
  appendPostActionLinks(post, dateActions);
  if (includeNotification) {
    const notificationButton = createReplyNotificationButton(post);
    if (notificationButton) dateActions.append(document.createTextNode('　'), notificationButton);
  }
  return dateActions;
}

function buildActionViewPost(post: ParsedPost, depth = 0): HTMLElement {
  const article = document.createElement('article');
  article.className = 'post bbs-action-view-post';
  article.dataset.postKey = postKey(post);

  const meta = document.createElement('div');
  meta.className = 'post-meta';
  const primary = document.createElement('div');
  primary.className = 'post-meta-primary';

  const normalizedTitle = post.title.trim();
  if (normalizedTitle) {
    const title = document.createElement('span');
    title.className = 'post-subject';
    appendHighlightedText(normalizedTitle, title, highlightHandleRegex);
    primary.append(title);
  }

  if (post.name.trim()) {
    const name = document.createElement('span');
    name.className = 'post-name';
    appendHighlightedText(post.name.trim(), name, highlightHandleRegex);
    primary.append(name);
  }

  primary.append(buildPostDateActions(post));
  meta.append(primary);

  article.append(meta, buildSafePostBody(post, (config?.global.tree_view_enabled ?? false) && depth > 0));
  return article;
}

function closeBbsActionView(): void {
  bbsActionViewPosts = [];
  bbsActionView.hidden = true;
  bbsActionView.setAttribute('aria-hidden', 'true');
  bbsActionViewContent.replaceChildren();
  restoreCurrentPostSelection();
}

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return savedAt;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function renderSavedPosts(): void {
  const fragment = document.createDocumentFragment();
  const visibleSavedPosts = filterHiddenThreadPosts(savedPosts, hiddenThreadKeys);
  const treeGroupsByKey = new Map(
    savedTreeGroups(visibleSavedPosts).map((posts) => [posts[0].saved_tree_key?.trim() ?? '', posts]),
  );
  const renderedTreeKeys = new Set<string>();
  for (const savedPost of visibleSavedPosts) {
    const treeKey = savedPost.saved_tree_key?.trim();
    if (treeKey) {
      if (renderedTreeKeys.has(treeKey)) continue;
      renderedTreeKeys.add(treeKey);
      const treePosts = treeGroupsByKey.get(treeKey) ?? [];
      for (const group of buildTreeDisplayGroups(treePosts)) {
        fragment.append(buildTreeGroupElement(group, true));
      }
      continue;
    }

    const article = buildActionViewPost(savedPost);
    const primary = article.querySelector<HTMLElement>('.post-meta-primary');
    const savedMeta = document.createElement('span');
    savedMeta.className = 'saved-post-meta';

    const site = document.createElement('span');
    site.className = `site-badge ${bbsBadgeClassName(savedPost.site_id)}`;
    site.textContent = siteNames.get(savedPost.site_id) ?? savedPost.site_id;
    savedMeta.append(site);

    const savedAt = document.createElement('time');
    savedAt.className = 'saved-post-time';
    savedAt.dateTime = savedPost.saved_at;
    savedAt.textContent = `保存日時：${formatSavedAt(savedPost.saved_at)}`;
    savedMeta.append(savedAt);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'saved-post-remove-button';
    remove.textContent = '削除';
    remove.title = 'この投稿を保存済み投稿から削除します';
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => deleteSavedPost(savedPost.site_id, savedPost.id));
    savedMeta.append(remove);
    primary?.append(savedMeta);
    fragment.append(article);
  }

  if (savedPosts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'bbs-action-view-message';
    empty.textContent = '保存済みの投稿はありません。投稿タイムラインの「保存」から追加できます。';
    fragment.append(empty);
  }
  savedPostsViewContent.replaceChildren(fragment);
}

function openSavedPostsView(): void {
  if (!(config?.global.post_saving_enabled ?? true)) return;
  closeBbsActionView();
  closeShortcutKeyListView(false);
  closeTextSearch();
  renderSavedPosts();
  savedPostsView.hidden = false;
  savedPostsView.setAttribute('aria-hidden', 'false');
  restoreCurrentPostSelection();
  savedPostsViewCloseButton.focus();
}

function closeSavedPostsView(): void {
  closeTextSearch();
  savedPostsView.hidden = true;
  savedPostsView.setAttribute('aria-hidden', 'true');
  savedPostsViewContent.replaceChildren();
}

function openShortcutKeyListView(): void {
  closeBbsActionView();
  closeSavedPostsView();
  closeTextSearch();
  shortcutKeyListView.hidden = false;
  shortcutKeyListView.setAttribute('aria-hidden', 'false');
  shortcutKeyListViewCloseButton.focus();
}

function closeShortcutKeyListView(restoreFocus = true): void {
  const wasOpen = !shortcutKeyListView.hidden;
  shortcutKeyListView.hidden = true;
  shortcutKeyListView.setAttribute('aria-hidden', 'true');
  if (wasOpen && restoreFocus) shortcutKeyListButton.focus();
}

let bbsActionViewRequestSerial = 0;

type PostFormControlElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type PostFormEncodingWarning = {
  encoding: string;
  invalid_text: string;
};

const POST_USER_FIELD_LABELS: Record<NonNullable<BbsPostFormControl['user_field']>, string> = {
  author: '投稿者',
  email: 'メール',
  subject: '題名',
  body: '内容',
  url: 'URL',
};

function createPostFormControl(
  control: BbsPostFormControl,
  elements: Map<string, PostFormControlElement>,
): HTMLElement | null {
  // 未読菩薩でユーザーが変更できるのは、投稿者・メール・題名・内容・URLだけ。
  // d / a / 各種checkbox等、掲示板固有の補助項目は元HTMLの値を保持して送信するがUIには出さない。
  if (!control.user_field) return null;
  if (control.control_type === 'hidden' || control.control_type === 'submit'
    || control.control_type === 'checkbox' || control.control_type === 'radio') {
    return null;
  }

  const label = document.createElement('label');
  label.className = 'bbs-follow-post-field';

  const caption = document.createElement('span');
  caption.className = 'bbs-follow-post-label';
  // 元BBSのplaceholder/titleにショートカット案内が含まれていても表示せず、
  // 意味上の5項目名へ必ず正規化する。
  caption.textContent = POST_USER_FIELD_LABELS[control.user_field];
  label.append(caption);

  let field: PostFormControlElement;
  if (control.control_type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.rows = 8;
    textarea.value = control.value;
    textarea.required = control.required;
    textarea.readOnly = control.readonly;
    if (control.maxlength !== null) textarea.maxLength = control.maxlength;
    field = textarea;
  } else if (control.control_type === 'select') {
    const select = document.createElement('select');
    for (const option of control.options) {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label || option.value;
      optionElement.selected = option.value === control.value;
      select.append(optionElement);
    }
    select.required = control.required;
    select.disabled = control.readonly;
    field = select;
  } else {
    const input = document.createElement('input');
    const allowedTypes = new Set(['text', 'email', 'url', 'search', 'tel']);
    input.type = allowedTypes.has(control.control_type) ? control.control_type : 'text';
    input.value = control.value;
    input.required = control.required;
    input.readOnly = control.readonly;
    if (control.maxlength !== null) input.maxLength = control.maxlength;
    field = input;
  }

  field.dataset.postFormControlId = control.id;
  field.autocomplete = 'off';
  elements.set(control.id, field);
  label.append(field);
  return label;
}

function collectPostFormInputs(elements: Map<string, PostFormControlElement>): BbsPostFormInput[] {
  const inputs: BbsPostFormInput[] = [];
  for (const [id, element] of elements) {
    inputs.push({ id, value: element.value, checked: false });
  }
  return inputs;
}

function updatePostFormEncodingWarning(
  siteId: string,
  elements: Map<string, PostFormControlElement>,
  warning: HTMLElement,
  requestSerial: number,
  latestRequestSerial: () => number,
): void {
  void invoke<PostFormEncodingWarning | null>('get_post_form_encoding_warning', {
    siteId,
    inputs: collectPostFormInputs(elements),
  }).then((result) => {
    if (requestSerial !== latestRequestSerial() || !warning.isConnected) return;
    if (!result) {
      warning.hidden = true;
      warning.textContent = '';
      return;
    }
    warning.textContent = `${result.encoding} 外の文字を含んでいる可能性があります: ${result.invalid_text}`;
    warning.hidden = false;
  }).catch(() => {
    // 入力中の補助的な警告なので、通信失敗を投稿フォームのエラーにはしない。
  });
}

type PostComposeKind = 'follow' | 'new';

function buildPostForm(
  kind: PostComposeKind,
  siteId: string,
  postForm: BbsPostForm,
): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'bbs-follow-post-form';
  form.autocomplete = 'off';

  const heading = document.createElement('div');
  heading.className = 'bbs-follow-post-form-heading';
  const title = document.createElement('strong');
  title.textContent = kind === 'follow'
    ? 'フォロー投稿'
    : `新規投稿 — ${siteNames.get(siteId) ?? siteId}`;
  const note = document.createElement('small');
  note.textContent = kind === 'follow'
    ? '元BBSのフォロー投稿フォームを使用して送信します。コメントアウトされたタグは送信しません。'
    : '選択したBBSの通常投稿フォームを使用して送信します。コメントアウトされたタグは送信しません。';
  heading.append(title, note);
  form.append(heading);

  const fields = document.createElement('div');
  fields.className = 'bbs-follow-post-fields';
  const elements = new Map<string, PostFormControlElement>();
  for (const control of postForm.controls) {
    const field = createPostFormControl(control, elements);
    if (field) fields.append(field);
  }
  form.append(fields);
  const encodingWarning = document.createElement('div');
  encodingWarning.className = 'bbs-follow-post-encoding-warning';
  encodingWarning.setAttribute('role', 'status');
  encodingWarning.setAttribute('aria-live', 'polite');
  encodingWarning.hidden = true;
  form.append(encodingWarning);
  let encodingWarningRequestSerial = 0;
  const refreshEncodingWarning = () => {
    const requestSerial = ++encodingWarningRequestSerial;
    updatePostFormEncodingWarning(
      siteId,
      elements,
      encodingWarning,
      requestSerial,
      () => encodingWarningRequestSerial,
    );
  };
  form.addEventListener('input', () => {
    bbsActionViewContent.dataset.postFormDirty = 'true';
    refreshEncodingWarning();
  });

  const actions = document.createElement('div');
  actions.className = 'bbs-follow-post-actions';
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'bbs-follow-post-submit';
  submitButton.textContent = '投稿';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'bbs-follow-post-clear';
  clearButton.textContent = '消す';
  clearButton.addEventListener('click', () => {
    let bodyElement: PostFormControlElement | null = null;
    for (const control of postForm.controls) {
      if (control.user_field !== 'body') continue;
      const element = elements.get(control.id);
      if (!element) continue;
      element.value = '';
      bodyElement ??= element;
    }
    refreshEncodingWarning();
    bodyElement?.focus();
  });

  const status = document.createElement('span');
  status.className = 'bbs-follow-post-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  actions.append(submitButton, clearButton, status);
  form.append(actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    void submitPostForm(kind, siteId, postForm.source_url, elements, submitButton, status);
  });
  form.addEventListener('keydown', (event) => {
    if (!isPostSubmitShortcut(event, navigator.platform)) return;
    event.preventDefault();
    form.requestSubmit(submitButton);
  });

  return form;
}

function renderBbsActionViewResult(
  result: BbsActionViewResult,
  kind: BbsActionKind,
  afterSubmit = false,
): void {
  const visiblePosts = filterHiddenThreadPosts(result.posts, hiddenThreadKeys);
  bbsActionViewPosts = visiblePosts;
  bbsActionViewSite.textContent = result.site_name;
  bbsActionViewContent.replaceChildren();

  const fragment = document.createDocumentFragment();

  if (afterSubmit && result.error_message) {
    const responseMessage = document.createElement('div');
    responseMessage.className = 'bbs-action-view-message bbs-action-view-response-message is-error';
    responseMessage.textContent = result.error_message;
    fragment.append(responseMessage);
  } else if (afterSubmit && result.message) {
    const responseMessage = document.createElement('div');
    responseMessage.className = 'bbs-action-view-message bbs-action-view-response-message';
    responseMessage.textContent = result.message;
    fragment.append(responseMessage);
  }

  if (visiblePosts.length > 0) {
    if (kind !== 'follow' && shouldRenderActionViewAsTree(kind, config?.global.tree_view_enabled ?? false)) {
      for (const group of buildTreeDisplayGroups(visiblePosts)) {
        fragment.append(buildTreeGroupElement(group, true));
      }
    } else {
      for (const post of visiblePosts) fragment.append(buildActionViewPost(post, 0));
    }
  } else if ((!afterSubmit || !result.message) && !(kind === 'follow' && result.post_form)) {
    const message = document.createElement('div');
    message.className = 'bbs-action-view-message';
    message.textContent = result.message || (afterSubmit ? '投稿先から応答を受信しました。' : '表示できる投稿がありません。');
    fragment.append(message);
  }

  if (kind === 'follow' && result.post_form) {
    fragment.append(buildPostForm('follow', result.site_id, result.post_form));
  }

  bbsActionViewContent.append(fragment);
  if (visiblePosts.length > 0) restoreCurrentPostSelection();

  if (kind === 'follow' && result.post_form) {
    const body = bbsActionViewContent.querySelector<HTMLTextAreaElement>('.bbs-follow-post-form textarea');
    body?.focus();
    if (body) body.setSelectionRange(body.value.length, body.value.length);
  }
}

async function submitPostForm(
  kind: PostComposeKind,
  siteId: string,
  sourceUrl: string,
  elements: Map<string, PostFormControlElement>,
  submitButton: HTMLButtonElement,
  status: HTMLElement,
): Promise<void> {
  if (bbsActionSubmitInFlight) return;

  const requestSerial = ++bbsActionViewRequestSerial;
  bbsActionSubmitInFlight = true;
  submitButton.disabled = true;
  const siteSelect = kind === 'new'
    ? bbsActionViewContent.querySelector<HTMLSelectElement>('.bbs-new-post-site-select')
    : null;
  if (siteSelect) siteSelect.disabled = true;
  status.classList.remove('is-error');
  status.textContent = '投稿しています…';
  lastBbsRequestStartedAtMs = Date.now();

  try {
    const inputs = collectPostFormInputs(elements);
    const command = kind === 'follow' ? 'submit_follow_post' : 'submit_new_post';
    const result = await invoke<BbsActionViewResult>(command, {
      siteId,
      sourceUrl,
      inputs,
    });
    if (requestSerial !== bbsActionViewRequestSerial || bbsActionView.hidden) return;

    if (result.posts.length > 0) {
      mergePosts(result.posts);
    }

    if (result.tracking_error.trim()) {
      setReplyNotificationFooterError(result.tracking_error);
    }

    // 投稿先HTMLにエラーメッセージが見つからなければ投稿成功扱いにし、
    // レスポンス画面へ遷移せずそのまま投稿オーバーレイを閉じる。
    if (!result.error_message.trim()) {
      await refreshReplyNotificationUiState();
      renderPosts();
      if (result.tracking_error.trim()) setReplyNotificationFooterError(result.tracking_error);
      closeBbsActionView();
      return;
    }

    renderPosts();
    if (kind === 'follow') {
      renderBbsActionViewResult(result, 'follow', true);
    } else {
      renderNewPostView(result.site_id, result, true);
    }
  } catch (error) {
    if (requestSerial !== bbsActionViewRequestSerial || bbsActionView.hidden) return;
    status.classList.add('is-error');
    status.textContent = `投稿できませんでした: ${String(error)}`;
  } finally {
    bbsActionSubmitInFlight = false;
    if (submitButton.isConnected) submitButton.disabled = false;
    if (siteSelect?.isConnected) siteSelect.disabled = false;
    if (kind === 'new') {
      const currentSiteSelect = bbsActionViewContent.querySelector<HTMLSelectElement>('.bbs-new-post-site-select');
      if (currentSiteSelect) currentSiteSelect.disabled = false;
    }
  }
}

function buildNewPostSiteSelector(selectedSiteId: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'bbs-new-post-site-picker';

  const summary = document.createElement('div');
  summary.className = 'bbs-new-post-site-summary';
  const summaryLabel = document.createElement('span');
  summaryLabel.className = 'bbs-new-post-site-summary-label';
  summaryLabel.textContent = '投稿先';
  const summaryBadge = document.createElement('span');
  summaryBadge.className = `site-badge bbs-new-post-site-badge ${bbsBadgeClassName(selectedSiteId)}`;
  summaryBadge.textContent = siteNames.get(selectedSiteId) ?? selectedSiteId;
  summary.append(summaryLabel, summaryBadge);

  const label = document.createElement('label');
  label.className = 'bbs-follow-post-field';
  const caption = document.createElement('span');
  caption.className = 'bbs-follow-post-label';
  caption.textContent = '掲示板を変更';

  const select = document.createElement('select');
  select.className = 'bbs-new-post-site-select';
  select.setAttribute('aria-label', '投稿する掲示板');
  for (const site of enabledSites) {
    const option = document.createElement('option');
    option.value = site.id;
    option.textContent = site.name;
    option.selected = site.id === selectedSiteId;
    select.append(option);
  }
  select.disabled = bbsActionSubmitInFlight;
  select.addEventListener('change', () => {
    if (!select.value) return;
    const formDirty = bbsActionViewContent.dataset.postFormDirty === 'true';
    if (shouldConfirmNewPostSiteChange(formDirty)) {
      const confirmed = window.confirm(
        `${formatNewPostDestinationLabel(siteNames.get(select.value) ?? select.value)}へ変更しますか？\n入力内容は破棄されます。`,
      );
      if (!confirmed) {
        select.value = selectedSiteId;
        return;
      }
    }
    void loadNewPostForm(select.value);
  });

  label.append(caption, select);
  const hint = document.createElement('small');
  hint.className = 'bbs-new-post-site-hint';
  hint.textContent = '投稿先をよく確認してから投稿してください。';
  wrapper.append(summary, label, hint);
  return wrapper;
}

function renderNewPostView(
  siteId: string,
  result: BbsActionViewResult | null,
  afterSubmit = false,
  message = '',
  isError = false,
): void {
  bbsActionViewPosts = result?.posts ?? [];
  bbsActionViewSite.textContent = siteNames.get(siteId) ?? result?.site_name ?? siteId;
  bbsActionViewTitle.textContent = '新規投稿';
  bbsActionViewContent.replaceChildren();
  bbsActionViewContent.dataset.postFormDirty = 'false';

  const fragment = document.createDocumentFragment();
  fragment.append(buildNewPostSiteSelector(siteId));

  if (afterSubmit && result?.error_message) {
    const errorMessage = document.createElement('div');
    errorMessage.className = 'bbs-action-view-message bbs-action-view-response-message is-error';
    errorMessage.textContent = result.error_message;
    fragment.append(errorMessage);
  } else if (message) {
    const stateMessage = document.createElement('div');
    stateMessage.className = `bbs-action-view-message${isError ? ' is-error' : ''}`;
    stateMessage.textContent = message;
    fragment.append(stateMessage);
  }

  if (result?.post_form) {
    fragment.append(buildPostForm('new', siteId, result.post_form));
  } else if (result && !message) {
    const noForm = document.createElement('div');
    noForm.className = 'bbs-action-view-message is-error';
    noForm.textContent = 'この掲示板から新規投稿フォームを取得できませんでした。';
    fragment.append(noForm);
  }

  bbsActionViewContent.append(fragment);

  if (result?.post_form) {
    const body = bbsActionViewContent.querySelector<HTMLTextAreaElement>('.bbs-follow-post-form textarea');
    body?.focus();
  }
}

async function loadNewPostForm(siteId: string): Promise<void> {
  const requestSerial = ++bbsActionViewRequestSerial;
  renderNewPostView(siteId, null, false, '投稿フォームを取得しています…');

  try {
    const result = await invoke<BbsActionViewResult>('fetch_new_post_form', { siteId });
    if (requestSerial !== bbsActionViewRequestSerial || bbsActionView.hidden) return;
    renderNewPostView(siteId, result);
  } catch (error) {
    if (requestSerial !== bbsActionViewRequestSerial || bbsActionView.hidden) return;
    renderNewPostView(siteId, null, false, `投稿フォームを取得できませんでした: ${String(error)}`, true);
  }
}

function openNewPostView(): void {
  if (enabledSites.length === 0) return;
  closeSavedPostsView();
  closeShortcutKeyListView(false);
  bbsActionView.hidden = false;
  bbsActionView.setAttribute('aria-hidden', 'false');
  bbsActionViewTitle.textContent = '新規投稿';
  const firstSite = enabledSites[0];
  void loadNewPostForm(firstSite.id);
}

async function openBbsActionView(siteId: string, href: string, kind: BbsActionKind): Promise<void> {
  const requestSerial = ++bbsActionViewRequestSerial;
  closeSavedPostsView();
  closeShortcutKeyListView(false);
  bbsActionView.hidden = false;
  bbsActionView.setAttribute('aria-hidden', 'false');
  bbsActionViewSite.textContent = siteNames.get(siteId) ?? siteId;
  bbsActionViewTitle.textContent = kind === 'follow'
    ? '■ フォロー投稿'
    : kind === 'tree'
      ? '◆ スレッド（ツリー表示）'
      : '◆ スレッド';
  bbsActionViewPosts = [];
  bbsActionViewContent.replaceChildren();

  const loading = document.createElement('div');
  loading.className = 'bbs-action-view-message';
  loading.textContent = '取得しています…';
  bbsActionViewContent.append(loading);
  bbsActionViewCloseButton.focus();

  try {
    const result = await invoke<BbsActionViewResult>('fetch_bbs_action_view', { siteId, href });
    if (requestSerial !== bbsActionViewRequestSerial || bbsActionView.hidden) return;
    renderBbsActionViewResult(result, kind, false);
  } catch (error) {
    if (requestSerial !== bbsActionViewRequestSerial || bbsActionView.hidden) return;
    const message = document.createElement('div');
    message.className = 'bbs-action-view-message is-error';
    message.textContent = `リンク先を取得できませんでした: ${String(error)}`;
    bbsActionViewContent.replaceChildren(message);
  }
}

function actionViewPostElements(): HTMLElement[] {
  return Array.from(bbsActionViewContent.querySelectorAll<HTMLElement>('article.post[data-post-key]'));
}

function savedPostElements(): HTMLElement[] {
  return Array.from(savedPostsViewContent.querySelectorAll<HTMLElement>('article.post[data-post-key]'));
}

function visiblePostElements(): HTMLElement[] {
  if (!savedPostsView.hidden) return savedPostElements();
  if (!bbsActionView.hidden && bbsActionViewPosts.length > 0) return actionViewPostElements();
  return Array.from(postsElement.querySelectorAll<HTMLElement>('article.post[data-post-key]'));
}

function getCurrentShortcutPost(): ParsedPost | undefined {
  if (!currentPostKey) return undefined;
  if (!savedPostsView.hidden) {
    return savedPosts.find((post) => postKey(post) === currentPostKey);
  }
  return (!bbsActionView.hidden && bbsActionViewPosts.length > 0 ? bbsActionViewPosts : [...postsByKey.values()])
    .find((post) => postKey(post) === currentPostKey);
}

function setCurrentPostElement(article: HTMLElement, scrollIntoView = false): void {
  const key = article.dataset.postKey;
  if (!key) return;

  for (const postElement of document.querySelectorAll<HTMLElement>('article.post[data-post-key]')) {
    const isCurrent = postElement === article;
    postElement.classList.toggle('post-current', isCurrent);
    if (isCurrent) postElement.setAttribute('aria-current', 'true');
    else postElement.removeAttribute('aria-current');
  }
  currentPostKey = key;

  if (scrollIntoView) {
    article.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
}

function restoreCurrentPostSelection(): void {
  const posts = visiblePostElements();
  if (posts.length === 0) {
    currentPostKey = null;
    return;
  }

  const current = currentPostKey
    ? posts.find((post) => post.dataset.postKey === currentPostKey)
    : null;
  setCurrentPostElement(current ?? posts[0], false);
}

function moveCurrentPost(delta: -1 | 1): void {
  const posts = visiblePostElements();
  if (posts.length === 0) return;

  let index = currentPostKey
    ? posts.findIndex((post) => post.dataset.postKey === currentPostKey)
    : -1;
  if (index < 0) index = delta > 0 ? -1 : posts.length;

  const nextIndex = Math.max(0, Math.min(posts.length - 1, index + delta));
  setCurrentPostElement(posts[nextIndex], true);
}

function moveToNextUnreadPost(): void {
  if (!settingsDialog.hidden || !savedPostsView.hidden || !shortcutKeyListView.hidden || !textSearchBar.hidden || !bbsActionView.hidden) return;

  const unreadPosts = sortedPosts()
    .filter((post) => !isNgPost(post) && isPostUnread(post))
    .sort((left, right) => compareNewestFirst(right, left));
  if (unreadPosts.length === 0) return;

  const currentIndex = unreadPosts.findIndex((post) => postKey(post) === currentPostKey);
  const nextPost = unreadPosts[Math.min(currentIndex + 1, unreadPosts.length - 1)];
  const selector = `.post[data-post-key="${CSS.escape(postKey(nextPost))}"]`;
  const article = postsElement.querySelector<HTMLElement>(selector);
  if (article) setCurrentPostElement(article, true);
}

function openCurrentPostFollow(): void {
  const post = getCurrentShortcutPost();
  if (!post?.follow_url) return;
  void openBbsActionView(post.site_id, post.follow_url, 'follow');
}

function openCurrentPostAction(kind: 'thread' | 'tree'): void {
  const post = getCurrentShortcutPost();
  const href = post ? actionUrlForPost(post, kind) : null;
  if (!post || !href) return;
  void openBbsActionView(post.site_id, href, kind);
}

function deleteCurrentSavedPost(): void {
  const post = getCurrentShortcutPost();
  if (!post) return;
  deleteSavedPost(post.site_id, post.id);
  restoreCurrentPostSelection();
}

function jumpToUnreadBoundaryFromShortcut(): void {
  if (config?.global.tree_view_enabled ?? false) {
    const posts = sortedPosts().filter((post) => !isNgPost(post));
    const groups = buildTreeDisplayGroups(posts);
    const unreadGroups = groups.filter((group) => group.posts.some(isPostUnread));
    const newestFirst = config?.global.post_order !== 'oldest_first';
    const boundaryGroup = newestFirst ? unreadGroups.at(-1) : unreadGroups[0];

    if (boundaryGroup) {
      const unreadItems = boundaryGroup.items.filter((item) => isPostUnread(item.post));
      const boundaryItem = newestFirst ? unreadItems.at(-1) : unreadItems[0];
      if (boundaryItem) {
        const key = postKey(boundaryItem.post);
        const article = visiblePostElements().find((post) => post.dataset.postKey === key);
        if (article) setCurrentPostElement(article, false);
      }
    }
  } else {
    const oldestUnread = visibleNewestFirstPosts()
      .filter(isPostUnread)
      .at(-1);

    if (oldestUnread) {
      const key = postKey(oldestUnread);
      const article = visiblePostElements().find((post) => post.dataset.postKey === key);
      if (article) setCurrentPostElement(article, false);
    }
  }

  jumpToUnreadBoundary();
}

function jumpToNewestPost(): void {
  const newest = visibleNewestFirstPosts()[0];
  if (!newest) return;

  const key = postKey(newest);
  const article = visiblePostElements().find((post) => post.dataset.postKey === key);
  if (!article) return;
  setCurrentPostElement(article, true);
}


type DisplayPost = {
  post: ParsedPost;
  depth: number;
};

type TreeDisplayPost = DisplayPost & {
  headerPrefix: string;
  bodyPrefix: string;
  hasChildren: boolean;
};

type TreeDisplayGroup = {
  key: string;
  siteId: string;
  posts: ParsedPost[];
  latestPost: ParsedPost;
  threadPost: ParsedPost;
  items: TreeDisplayPost[];
};

function compareOldestFirst(a: ParsedPost, b: ParsedPost): number {
  return -compareNewestFirst(a, b);
}

function treeThreadKey(post: ParsedPost): string {
  const threadId = post.thread_id?.trim() || post.id;
  return `${post.site_id}:${threadId}`;
}

function buildTreeDisplayGroups(posts: ParsedPost[]): TreeDisplayGroup[] {
  const groups = new Map<string, ParsedPost[]>();
  for (const post of posts) {
    const key = treeThreadKey(post);
    const group = groups.get(key);
    if (group) group.push(post);
    else groups.set(key, [post]);
  }

  const groupEntries = [...groups.entries()];
  groupEntries.sort(([, left], [, right]) => {
    // ツリーの並びも既読カーソルと同じ「日時 + post_key」の順序に揃える。
    // 同一秒の投稿が複数ツリーにまたがっても、未読ツリーと既読ツリーが境界をまたいで混在しない。
    const leftLatest = left.slice().sort(compareNewestFirst)[0];
    const rightLatest = right.slice().sort(compareNewestFirst)[0];
    const diff = compareNewestFirst(leftLatest, rightLatest);
    return config?.global.post_order === 'oldest_first' ? -diff : diff;
  });

  return groupEntries.map(([key, group]) => {
    const byId = new Map(group.map((post) => [post.id, post]));
    const children = new Map<string, ParsedPost[]>();
    const hasParent = new Set<string>();

    for (const post of group) {
      let parent: ParsedPost | undefined;
      const explicitParentId = post.parent_id?.trim();
      if (explicitParentId && explicitParentId !== post.id) {
        parent = byId.get(explicitParentId);
      }

      if (!parent) {
        const threadId = post.thread_id?.trim();
        if (threadId && threadId !== post.id) parent = byId.get(threadId);
      }

      if (!parent || parent === post) continue;
      if (/^\d+$/.test(parent.id) && /^\d+$/.test(post.id) && Number(parent.id) >= Number(post.id)) {
        continue;
      }

      const siblings = children.get(parent.id);
      if (siblings) siblings.push(post);
      else children.set(parent.id, [post]);
      hasParent.add(post.id);
    }

    for (const siblings of children.values()) siblings.sort(compareOldestFirst);
    const roots = group.filter((post) => !hasParent.has(post.id)).sort(compareOldestFirst);
    const visited = new Set<string>();
    const items: TreeDisplayPost[] = [];

    const appendBranch = (
      post: ParsedPost,
      depth: number,
      ancestorSiblingContinues: boolean[],
      isLastSibling: boolean,
    ): void => {
      if (visited.has(post.id)) return;
      visited.add(post.id);
      const descendants = children.get(post.id) ?? [];
      const hasChildren = descendants.length > 0;
      const { headerPrefix, bodyPrefix } = buildTreeNodePrefixes({
        depth,
        ancestorSiblingContinues,
        isLastSibling,
        hasChildren,
      });
      items.push({ post, depth, headerPrefix, bodyPrefix, hasChildren });

      descendants.forEach((child, index) => {
        const childIsLast = index === descendants.length - 1;
        const childAncestors = depth === 0
          ? []
          : [...ancestorSiblingContinues, !isLastSibling];
        appendBranch(child, depth + 1, childAncestors, childIsLast);
      });
    };

    roots.forEach((root, index) => appendBranch(root, 0, [], index === roots.length - 1));
    for (const post of group.slice().sort(compareOldestFirst)) {
      if (!visited.has(post.id)) appendBranch(post, 0, [], true);
    }

    const latestPost = group.slice().sort(compareNewestFirst)[0];
    const threadId = group[0].thread_id?.trim();
    const threadPost = (threadId ? byId.get(threadId) : undefined)
      ?? roots[0]
      ?? group.slice().sort(compareOldestFirst)[0];

    return {
      key,
      siteId: group[0].site_id,
      posts: group,
      latestPost,
      threadPost,
      items,
    };
  });
}

function createTreeActionLink(post: ParsedPost, kind: BbsActionKind): HTMLElement {
  return createPostActionLink(post, kind) ?? (() => {
    const fallback = document.createElement('span');
    fallback.className = 'post-action-link is-disabled';
    fallback.textContent = kind === 'follow' ? '■' : '◆';
    return fallback;
  })();
}

function buildTreeHeader(group: TreeDisplayGroup): HTMLElement {
  const header = document.createElement('div');
  header.className = 'tree-thread-header';

  const threadSource = group.posts.find((post) => Boolean(post.thread_url)) ?? group.threadPost;
  header.append(createTreeActionLink(threadSource, 'thread'));
  header.append(document.createTextNode(`　更新日：${group.latestPost.posted_at_raw || '-'}　記事数：${group.posts.length}`));
  header.append(document.createTextNode('　'));
  header.append(createThreadHideLink(group.threadPost));

  const site = document.createElement('span');
  site.className = `site-badge tree-thread-site-badge ${bbsBadgeClassName(group.siteId)}`;
  site.dataset.bbsId = group.siteId;
  site.textContent = siteNames.get(group.siteId) ?? group.siteId;
  header.append(site);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'tree-save-button';
  saveButton.dataset.treePostKeys = JSON.stringify(group.posts.map(postKey));
  const updateButton = (): void => {
    const saved = arePostsSaved(savedPosts, group.posts);
    saveButton.classList.toggle('is-saved', saved);
    saveButton.textContent = saved ? 'ツリーを保存解除' : 'ツリーを保存';
    saveButton.title = saved ? 'このツリーの投稿を保存済み投稿から削除します' : 'このツリーの投稿を保存済み投稿に追加します';
    saveButton.setAttribute('aria-label', saveButton.title);
  };
  updateButton();
  saveButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (arePostsSaved(savedPosts, group.posts)) {
      deleteSavedPosts(group.posts);
    } else {
      savePostsForLater(group.posts, group.key);
    }
    updateSaveButtons();
    updateButton();
  });
  if (config?.global.post_saving_enabled ?? true) header.append(saveButton);
  return header;
}

function normalizeTreeHeaderField(value: string): string {
  return value.replace(/^[\s\u3000]+|[\s\u3000]+$/gu, '');
}

function validTreeTitle(value: string): string | null {
  const normalized = normalizeTreeHeaderField(value);
  // くずは系で空題名相当として使われる「＞　」は表示しない。
  return normalized && normalized !== '＞' ? normalized : null;
}

function validTreeAuthor(value: string): string | null {
  const normalized = normalizeTreeHeaderField(value);
  return normalized || null;
}

function buildTreeNodeArticle(item: TreeDisplayPost, includePostKey: boolean): HTMLElement {
  const { post, headerPrefix, bodyPrefix, hasChildren } = item;
  const unread = isPostUnread(post);
  const article = document.createElement('article');
  article.className = unread ? 'post post-tree-node post-unread' : 'post post-tree-node';
  if (includePostKey) {
    article.dataset.postKey = postKey(post);
    article.dataset.unread = unread ? 'true' : 'false';
  }

  const firstLine = document.createElement('div');
  firstLine.className = 'tree-post-first-line';
  firstLine.append(document.createTextNode(`　${headerPrefix}`));
  firstLine.append(createTreeActionLink(post, 'follow'));

  const treeTitle = validTreeTitle(post.title);
  if (treeTitle) {
    const title = document.createElement('span');
    title.className = 'post-subject tree-post-subject';
    appendHighlightedText(treeTitle, title, highlightHandleRegex);
    firstLine.append(title, document.createTextNode(' '));
  }

  const treeAuthor = validTreeAuthor(post.name);
  if (treeAuthor) {
    const name = document.createElement('span');
    name.className = 'post-name tree-post-name';
    appendHighlightedText(treeAuthor, name, highlightHandleRegex);
    firstLine.append(name, document.createTextNode(' '));
  }

  const time = document.createElement('time');
  time.className = 'post-time tree-post-time';
  time.textContent = post.posted_at_raw || '-';
  if (post.posted_at) time.dateTime = post.posted_at;
  firstLine.append(time);
  firstLine.append(document.createTextNode('　'));
  firstLine.append(createTreeActionLink(post, 'follow'));
  firstLine.append(document.createTextNode('　'));
  firstLine.append(createTreeActionLink(post, 'thread'));
  const notificationButton = createReplyNotificationButton(post);
  if (notificationButton) firstLine.append(document.createTextNode('　'), notificationButton);
  if (config?.global.post_saving_enabled ?? true) {
    firstLine.append(document.createTextNode('　'), createSavePostButton(post));
  }

  if (unread) {
    firstLine.append(document.createTextNode('　'));
    const unreadBadge = document.createElement('span');
    unreadBadge.className = 'unread-badge';
    unreadBadge.textContent = '未読';
    firstLine.append(unreadBadge);
  }
  applyReplyNotificationPostPresentation(article, firstLine, post, unread);

  const contentRow = document.createElement('div');
  contentRow.className = hasChildren ? 'tree-post-content-row' : 'tree-post-content-row tree-post-content-row-leaf';
  const body = buildSafePostBody(post, true);
  // ツリー本文は常にノード記号「■」より全角1文字ぶん右から始める。
  // 縦線もCSSではなく本文各行の文字列として保持し、表示どおりにコピーできるようにする。
  const prefix = buildTreeBodyPrefix(bodyPrefix);
  body.prepend(document.createTextNode(prefix));
  for (const br of Array.from(body.querySelectorAll('br'))) {
    br.after(document.createTextNode(prefix));
  }

  const display = document.createElement('div');
  display.className = 'tree-post-display';
  display.append(body);
  contentRow.append(display);
  article.append(firstLine, contentRow);
  return article;
}

function buildTreeGroupElement(group: TreeDisplayGroup, includePostKeys: boolean): HTMLElement {
  const section = document.createElement('section');
  section.className = 'tree-thread-group';
  section.dataset.treeThreadKey = group.key;
  section.append(buildTreeHeader(group));
  for (const item of group.items) section.append(buildTreeNodeArticle(item, includePostKeys));
  return section;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return isPostNavigationShortcutTarget(target);
}

function shouldHandlePostNavigationShortcut(event: KeyboardEvent): boolean {
  if (!(config?.global.keyboard_shortcuts_enabled ?? true)) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (isEditableKeyboardTarget(event.target)) return false;
  if (!settingsDialog.hidden || !savedPostsView.hidden || !shortcutKeyListView.hidden || !textSearchBar.hidden) return false;
  if (!bbsActionView.hidden && bbsActionViewPosts.length === 0) return false;
  return true;
}

function shouldHandleSavedPostNavigationShortcut(event: KeyboardEvent): boolean {
  if (!(config?.global.keyboard_shortcuts_enabled ?? true)) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (isEditableKeyboardTarget(event.target)) return false;
  return !savedPostsView.hidden;
}

function shouldHandleModifiedNavigationShortcut(event: KeyboardEvent): boolean {
  if (!(config?.global.keyboard_shortcuts_enabled ?? true)) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  if (!['t', 'r', 'b'].includes(event.key.toLowerCase())) return false;
  if (isEditableKeyboardTarget(event.target)) return false;
  if (!settingsDialog.hidden || !savedPostsView.hidden || !shortcutKeyListView.hidden || !textSearchBar.hidden) return false;
  if (!bbsActionView.hidden && bbsActionViewPosts.length === 0) return false;
  if (event.key.toLowerCase() === 'b' && !bbsActionView.hidden) return false;
  return true;
}

function shouldHandleBbsTimelineShortcut(event: KeyboardEvent): boolean {
  if (!(config?.global.keyboard_shortcuts_enabled ?? true)) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  if (!/^[0-9]$/u.test(event.key)) return false;
  if (isEditableKeyboardTarget(event.target)) return false;
  if (!settingsDialog.hidden || !savedPostsView.hidden || !shortcutKeyListView.hidden || !textSearchBar.hidden) return false;
  return Boolean(bbsActionView.hidden);
}

function showBbsTimelineToast(message: string): void {
  if (bbsTimelineToastTimer !== null) window.clearTimeout(bbsTimelineToastTimer);
  bbsTimelineToast.textContent = message;
  bbsTimelineToast.hidden = false;
  bbsTimelineToastTimer = window.setTimeout(() => {
    bbsTimelineToast.hidden = true;
    bbsTimelineToastTimer = null;
  }, 3_000);
}

function renderBbsTimelineMenu(): void {
  if (!config) return;
  const fragment = document.createDocumentFragment();
  for (const item of bbsTimelineMenuItems(config.sites, selectedBbsTimelineSiteId)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitemradio');
    button.textContent = item.label;
    button.disabled = item.disabled;
    button.setAttribute('aria-checked', String(item.selected));
    button.classList.toggle('is-selected', item.selected);
    button.addEventListener('click', () => selectBbsTimeline(item.siteId));
    fragment.append(button);
  }
  bbsTimelineMenu.replaceChildren(fragment);
}

function selectBbsTimeline(selection: string | null): void {
  selectedBbsTimelineSiteId = selection;
  currentPostKey = null;
  renderPosts();
  renderBbsTimelineMenu();
  window.scrollTo({ top: 0 });

  const siteName = selection === null
    ? null
    : config?.sites.find((site) => site.id === selection)?.name ?? selection;
  showBbsTimelineToast(siteName === null ? 'すべての掲示板を表示しています' : `${siteName} を表示しています`);
}

function selectBbsTimelineForShortcut(key: string): boolean {
  if (!config) return false;
  const selection = bbsTimelineSelectionForShortcutKey(config.sites, key);
  if (selection === undefined) return false;

  selectBbsTimeline(selection);
  return true;
}

function toggleTimelineNavigation(): void {
  if (!bbsActionView.hidden) return;
  const hidden = timelineNavigation.classList.toggle('is-hidden');
  timelineLayout.classList.toggle('is-navigation-hidden', hidden);
}

function renderPosts(): void {
  const anchor = captureScrollAnchor();
  const posts = filterPostsForBbsTimeline(sortedPosts(), selectedBbsTimelineSiteId)
    .filter((post) => !isNgPost(post));
  const fragment = document.createDocumentFragment();
  const newestFirst = config?.global.post_order !== 'oldest_first';
  const unreadPostsNewestFirst = posts.slice().sort(compareNewestFirst).filter(isPostUnread);
  const count = unreadPostsNewestFirst.length;
  const oldestUnreadKey = count > 0 ? postKey(unreadPostsNewestFirst[count - 1]) : null;
  const treeEnabled = config?.global.tree_view_enabled ?? false;

  if (treeEnabled) {
    const groups = buildTreeDisplayGroups(posts);
    const groupHasUnread = (group: TreeDisplayGroup): boolean => group.posts.some(isPostUnread);

    // ツリー表示では未読境界を投稿の途中へ入れない。
    // 未読投稿を1件でも含むツリー全体を未読側として扱い、ツリーとツリーの間だけに境界を置く。
    const boundaryGroupIndex = newestFirst
      ? groups.reduce((last, group, index) => groupHasUnread(group) ? index : last, -1)
      : groups.findIndex(groupHasUnread);

    groups.forEach((group, groupIndex) => {
      if (!newestFirst && count > 0 && groupIndex === boundaryGroupIndex) {
        fragment.append(buildUnreadBoundary(count, false));
      }

      fragment.append(buildTreeGroupElement(group, true));

      if (newestFirst && count > 0 && groupIndex === boundaryGroupIndex) {
        fragment.append(buildUnreadBoundary(count, true));
      }
    });
  } else {
    for (const post of posts) {
      const key = postKey(post);
      if (!newestFirst && oldestUnreadKey && key === oldestUnreadKey) {
        fragment.append(buildUnreadBoundary(count, false));
      }

      const unread = isPostUnread(post);
      const article = document.createElement('article');
      article.className = unread ? 'post post-unread' : 'post';
      article.dataset.postKey = key;
      article.dataset.unread = unread ? 'true' : 'false';

      const meta = document.createElement('div');
      meta.className = 'post-meta';
      const primaryMeta = document.createElement('div');
      primaryMeta.className = 'post-meta-primary';

      const normalizedTitle = post.title.trim();
      if (normalizedTitle) {
        const title = document.createElement('span');
        title.className = 'post-subject';
        appendHighlightedText(normalizedTitle, title, highlightHandleRegex);
        primaryMeta.append(title);
      }

      const normalizedName = post.name.trim();
      if (normalizedName) {
        const name = document.createElement('span');
        name.className = 'post-name';
        appendHighlightedText(normalizedName, name, highlightHandleRegex);
        primaryMeta.append(name);
      }

      primaryMeta.append(buildPostDateActions(post, false));

      const site = document.createElement('span');
      site.className = `site-badge ${bbsBadgeClassName(post.site_id)}`;
      site.dataset.bbsId = post.site_id;
      site.textContent = siteNames.get(post.site_id) ?? post.site_id;
      primaryMeta.append(site);

      if (unread) {
        const unreadBadge = document.createElement('span');
        unreadBadge.className = 'unread-badge';
        unreadBadge.textContent = '未読';
        primaryMeta.append(unreadBadge);
      }
      applyReplyNotificationPostPresentation(article, primaryMeta, post, unread);
      const notificationButton = createReplyNotificationButton(post);
      if (notificationButton) primaryMeta.append(notificationButton);
      if (config?.global.post_saving_enabled ?? true) primaryMeta.append(createSavePostButton(post));
      meta.append(primaryMeta);

      article.append(meta, buildSafePostBody(post, false));
      fragment.append(article);

      if (newestFirst && oldestUnreadKey && key === oldestUnreadKey) {
        fragment.append(buildUnreadBoundary(count, true));
      }
    }
  }

  postsElement.replaceChildren(fragment);
  restoreCurrentPostSelection();
  updateUnreadControls(posts);
  renderReplyNotificationBanner();

  if (posts.length === 0) {
    noticeElement.hidden = false;
    noticeElement.textContent = '表示できる投稿がありません。';
  } else {
    noticeElement.hidden = true;
  }

  restoreScrollAnchor(anchor);
  if (!textSearchBar.hidden && textSearchInput.value) {
    refreshTextSearch(false, false);
  }
}

function formatFetchTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function applyDisplayConfig(globalConfig: GlobalConfig): void {
  const root = document.documentElement.style;
  root.setProperty('--reader-image-max-height', `${globalConfig.max_image_height_px}px`);
  root.setProperty('--reader-image-hover-max-width', `${globalConfig.image_hover_window_percent}vw`);
  root.setProperty('--reader-image-hover-max-height', `${globalConfig.image_hover_window_percent}vh`);
  refreshNgWordRegex(globalConfig);
  refreshHighlightRegex(globalConfig);
  const enabled = globalConfig.post_saving_enabled ?? true;
  savedPostsButton.hidden = !enabled;
  if (!enabled && !savedPostsView.hidden) closeSavedPostsView();
  startViewingModeTimer();
}

function applyReaderStyle(style: ReaderStyleConfig): void {
  const root = document.documentElement.style;
  root.setProperty('--system-font-family', style.system_font_family);
  root.setProperty('--system-font-size', `${style.system_font_size_px}px`);
  root.setProperty('--post-font-family', style.post_font_family);
  root.setProperty('--post-font-size', `${style.post_font_size_px}px`);

  for (const field of ALL_STYLE_COLOR_FIELDS) {
    root.setProperty(STYLE_COLOR_VAR_MAP[field.key], style[field.key]);
  }
  root.setProperty('--post-highlight-text-color', style.highlight_text_color);
  root.setProperty('--post-highlight-background-color', style.highlight_background_color);
  root.setProperty('--current-post-border-color', style.current_post_border_color);
}

function setGeneralSettingsDirty(dirty: boolean): void {
  generalSettingsDirty = dirty;
  generalDiscardButton.disabled = !dirty;
  generalDirtyLabel.textContent = dirty ? '未保存の変更があります' : '変更なし';
  generalDirtyLabel.classList.toggle('has-changes', dirty);
}

function showGeneralSettingsMessage(message: string, error = false): void {
  generalSettingsMessage.textContent = message;
  generalSettingsMessage.classList.toggle('settings-message-error', error);
}

function showConfigFileSettingsMessage(message: string, error = false): void {
  configFileSettingsMessage.textContent = message;
  configFileSettingsMessage.classList.toggle('settings-message-error', error);
}

function showResetSettingsMessage(message: string, error = false): void {
  resetSettingsMessage.textContent = message;
  resetSettingsMessage.classList.toggle('settings-message-error', error);
}

function switchSettingsTab(tab: SettingsTab): void {
  activeSettingsTab = tab;
  const showGeneral = tab === 'general';
  const showBbs = tab === 'bbs';
  const showConfigFile = tab === 'config-file';
  const showReset = tab === 'reset';
  const showVersion = tab === 'version';
  generalSettingsDialog.hidden = !showGeneral;
  bbsSettingsDialog.hidden = !showBbs;
  configFileSettingsDialog.hidden = !showConfigFile;
  resetSettingsDialog.hidden = !showReset;
  versionSettingsDialog.hidden = !showVersion;
  generalSettingsDialog.setAttribute('aria-hidden', String(!showGeneral));
  bbsSettingsDialog.setAttribute('aria-hidden', String(!showBbs));
  configFileSettingsDialog.setAttribute('aria-hidden', String(!showConfigFile));
  resetSettingsDialog.setAttribute('aria-hidden', String(!showReset));
  versionSettingsDialog.setAttribute('aria-hidden', String(!showVersion));
  settingsTabGeneralButton.classList.toggle('is-active', showGeneral);
  settingsTabBbsButton.classList.toggle('is-active', showBbs);
  settingsTabConfigFileButton.classList.toggle('is-active', showConfigFile);
  settingsTabResetButton.classList.toggle('is-active', showReset);
  settingsTabVersionButton.classList.toggle('is-active', showVersion);
  settingsTabGeneralButton.setAttribute('aria-selected', String(showGeneral));
  settingsTabBbsButton.setAttribute('aria-selected', String(showBbs));
  settingsTabConfigFileButton.setAttribute('aria-selected', String(showConfigFile));
  settingsTabResetButton.setAttribute('aria-selected', String(showReset));
  settingsTabVersionButton.setAttribute('aria-selected', String(showVersion));
  if (showReset) void refreshResetSettings();
}

function showSettingsDialog(tab: SettingsTab = 'general'): void {
  switchSettingsTab(tab);
  settingsDialog.hidden = false;
  settingsDialog.classList.remove('is-closed');
  settingsDialog.setAttribute('aria-hidden', 'false');
  if (!settingsDialog.open) settingsDialog.showModal();
}

function hideSettingsDialog(): void {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && settingsDialog.contains(activeElement)) {
    activeElement.blur();
  }
  if (settingsDialog.open) {
    try {
      settingsDialog.close();
    } catch {
      // hidden + is-closed でも確実に投稿画面へ戻す。
    }
  }
  settingsDialog.removeAttribute('open');
  settingsDialog.hidden = true;
  settingsDialog.classList.add('is-closed');
  settingsDialog.setAttribute('aria-hidden', 'true');
  window.requestAnimationFrame(() => settingsButton.focus({ preventScroll: true }));
}

function closeSettingsDialog(): void {
  if (generalSettingsDirty || bbsSettingsDirty) {
    if (activeSettingsTab === 'general' && generalSettingsDirty) {
      showGeneralSettingsMessage('未保存の変更があります。「変更を破棄」または「保存して反映」を選んでください。');
    } else if (activeSettingsTab === 'bbs' && bbsSettingsDirty) {
      showBbsSettingsMessage('未保存の変更があります。「変更を破棄」または「保存して反映」を選んでください。');
    } else if (generalSettingsDirty) {
      switchSettingsTab('general');
      showGeneralSettingsMessage('一般設定に未保存の変更があります。「変更を破棄」または「保存して反映」を選んでください。');
    } else {
      switchSettingsTab('bbs');
      showBbsSettingsMessage('BBS設定に未保存の変更があります。「変更を破棄」または「保存して反映」を選んでください。');
    }
    return;
  }
  hideSettingsDialog();
}

function openShortcutKeyListFromSettings(): void {
  if (generalSettingsDirty || bbsSettingsDirty) {
    closeSettingsDialog();
    return;
  }
  hideSettingsDialog();
  openShortcutKeyListView();
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/u);
  return parts[parts.length - 1]?.trim() || path;
}

const tomlFileFilter = [{ name: 'TOML設定ファイル', extensions: ['toml'] }];

async function exportSettingsFile(fileName: 'global.toml' | 'bbs.toml'): Promise<void> {
  try {
    const destinationPath = await save({
      title: `${fileName}をエクスポート`,
      defaultPath: fileName,
      filters: tomlFileFilter,
    });
    if (typeof destinationPath !== 'string' || !destinationPath.trim()) return;
    await invoke('export_config_file', { fileName, destinationPath });
    showConfigFileSettingsMessage(`${fileName}をエクスポートしました。`);
  } catch (error) {
    const message = `${fileName}をエクスポートできませんでした: ${String(error)}`;
    showConfigFileSettingsMessage(message, true);
  }
}

async function importSettingsFile(fileName: 'global.toml' | 'bbs.toml'): Promise<void> {
  if (fileName === 'global.toml' && generalSettingsDirty) {
    showGeneralSettingsMessage('未保存の一般設定があるため、先に保存または破棄してください。', true);
    return;
  }
  if (fileName === 'bbs.toml' && bbsSettingsDirty) {
    showBbsSettingsMessage('未保存のBBS設定があるため、先に保存または破棄してください。', true);
    return;
  }

  try {
    const sourcePath = await open({
      multiple: false,
      directory: false,
      title: `${fileName}をインポート`,
      filters: tomlFileFilter,
    });
    if (typeof sourcePath !== 'string' || !sourcePath.trim()) return;

    const loadedConfig = await invoke<ReaderConfig>('import_config_file', {
      fileName,
      sourcePath,
    });
    if (fileName === 'global.toml') {
      config = loadedConfig;
      generalDraftGlobal = structuredClone(loadedConfig.global);
      applyDisplayConfig(loadedConfig.global);
      mergePosts([]);
      renderGeneralSettingsForm();
      setGeneralSettingsDirty(false);
      await refreshReplyNotificationUiState();
      renderPosts();
      startReloadTimer();
      showConfigFileSettingsMessage('global.tomlをインポートして反映しました。');
    } else {
      bbsEditorSites = cloneSites(loadedConfig.sites);
      selectedBbsIndex = bbsEditorSites.length > 0 ? 0 : -1;
      setBbsSettingsDirty(false);
      renderBbsSettingsList();
      renderBbsEditor();
      await applyBbsConfigAfterSave(loadedConfig);
      showConfigFileSettingsMessage('bbs.tomlをインポートして反映しました。');
    }
  } catch (error) {
    const message = `${fileName}をインポートできませんでした: ${String(error)}`;
    showConfigFileSettingsMessage(message, true);
  }
}

function renderReplyNotificationSoundControls(): void {
  if (!generalDraftGlobal) return;
  const customName = notificationSoundDraftName
    ?? (generalDraftGlobal.reply_notification_sound_kind === 'custom'
      ? generalDraftGlobal.reply_notification_sound_custom_name.trim()
      : '');

  if (customName) {
    generalReplyNotificationSoundName.textContent = notificationSoundDraftName
      ? `${customName}（未保存）`
      : customName;
  } else {
    generalReplyNotificationSoundName.textContent = 'notify.ogg（既定）';
  }

  const usingDefault = !notificationSoundDraftName
    && generalDraftGlobal.reply_notification_sound_kind !== 'custom';
  generalReplyNotificationResetSoundButton.disabled = usingDefault && !notificationSoundDraftPath;
}

async function chooseReplyNotificationSound(): Promise<void> {
  if (!generalDraftGlobal) return;
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      title: '返信通知音を選択',
      filters: [{
        name: '音声ファイル',
        extensions: ['ogg', 'oga', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'webm'],
      }],
    });
    if (typeof selected !== 'string' || !selected.trim()) return;
    notificationSoundDraftPath = selected;
    notificationSoundDraftName = fileNameFromPath(selected);
    notificationSoundResetRequested = false;
    generalDraftGlobal.reply_notification_sound_kind = 'custom';
    generalDraftGlobal.reply_notification_sound_custom_name = notificationSoundDraftName;
    renderReplyNotificationSoundControls();
    setGeneralSettingsDirty(true);
  } catch (error) {
    showGeneralSettingsMessage(`通知音ファイルを選択できませんでした: ${String(error)}`, true);
  }
}

function resetReplyNotificationSoundToDefault(): void {
  if (!generalDraftGlobal) return;
  notificationSoundDraftPath = null;
  notificationSoundDraftName = null;
  notificationSoundResetRequested = true;
  generalDraftGlobal.reply_notification_sound_kind = 'default';
  generalDraftGlobal.reply_notification_sound_custom_name = '';
  renderReplyNotificationSoundControls();
  setGeneralSettingsDirty(true);
}

function renderGeneralSettingsForm(): void {
  if (!generalDraftGlobal || !generalDraftStyle) return;
  generalSystemFontFamilyInput.value = generalDraftStyle.system_font_family;
  generalSystemFontSizeInput.value = String(generalDraftStyle.system_font_size_px);
  generalPostFontFamilyInput.value = generalDraftStyle.post_font_family;
  generalPostFontSizeInput.value = String(generalDraftStyle.post_font_size_px);
  generalPollIntervalInput.value = String(generalDraftGlobal.poll_interval_seconds);
  updatePollIntervalWarning();
  generalMaxPostsInput.value = String(generalDraftGlobal.max_posts);
  generalPostSavingEnabledInput.checked = generalDraftGlobal.post_saving_enabled ?? true;
  generalTreeViewEnabledInput.checked = generalDraftGlobal.tree_view_enabled ?? false;
  generalHideTreeLinkInput.checked = !(generalDraftGlobal.hide_tree_link ?? false);
  generalHideThreadHideLinkInput.checked = !(generalDraftGlobal.hide_thread_hide_link ?? false);
  generalShowImagesInput.checked = generalDraftGlobal.show_post_images;
  generalShowFxTwitterPreviewsInput.checked = generalDraftGlobal.show_fxtwitter_previews ?? false;
  generalShowYouTubePreviewsInput.checked = generalDraftGlobal.show_youtube_previews ?? false;
  updateImageSizeSettingsVisibility();
  generalExpandNumericCharacterReferencesInput.checked = generalDraftGlobal.expand_numeric_character_references ?? false;
  generalShowImageDetailInput.checked = generalDraftGlobal.show_image_detail_link;
  generalImageMaxHeightInput.value = String(generalDraftGlobal.max_image_height_px);
  generalImageHoverWindowPercentInput.value = String(generalDraftGlobal.image_hover_window_percent);
  generalKeyboardShortcutsEnabledInput.checked = generalDraftGlobal.keyboard_shortcuts_enabled ?? true;
  generalViewingModeEnabledInput.checked = generalDraftGlobal.viewing_mode_enabled ?? false;
  generalViewingModeIntervalInput.value = String(generalDraftGlobal.viewing_mode_interval_seconds ?? DEFAULT_VIEWING_MODE_INTERVAL_SECONDS);
  updateViewingModeIntervalVisibility();
  generalReplyNotificationEnabledInput.checked = generalDraftGlobal.reply_notification_enabled ?? false;
  updateReplyNotificationOptionsVisibility();
  generalReplyNotificationIncludeDescendantsInput.checked = generalDraftGlobal.reply_notification_include_descendants ?? false;
  generalReplyNotificationSoundEnabledInput.checked = generalDraftGlobal.reply_notification_sound_enabled ?? false;
  renderReplyNotificationSoundControls();
  generalCurrentPostBorderColorInput.value = generalDraftStyle.current_post_border_color.toLowerCase();
  if (HEX_COLOR_RE.test(generalDraftStyle.current_post_border_color)) generalCurrentPostBorderColorPicker.value = generalDraftStyle.current_post_border_color;
  generalNgHandlePatternsInput.value = generalDraftGlobal.ng_handle_patterns ?? '';
  generalNgBodyPatternsInput.value = generalDraftGlobal.ng_body_patterns ?? '';
  generalHighlightHandlePatternsInput.value = generalDraftGlobal.highlight_handle_patterns ?? '';
  generalHighlightBodyPatternsInput.value = generalDraftGlobal.highlight_body_patterns ?? '';
  generalHighlightTextColorInput.value = generalDraftStyle.highlight_text_color.toLowerCase();
  if (HEX_COLOR_RE.test(generalDraftStyle.highlight_text_color)) generalHighlightTextColorPicker.value = generalDraftStyle.highlight_text_color;
  generalHighlightBackgroundColorInput.value = generalDraftStyle.highlight_background_color.toLowerCase();
  if (HEX_COLOR_RE.test(generalDraftStyle.highlight_background_color)) generalHighlightBackgroundColorPicker.value = generalDraftStyle.highlight_background_color;

  for (const field of ALL_STYLE_COLOR_FIELDS) {
    const pair = postColorInputs.get(field.key) ?? advancedPostColorInputs.get(field.key) ?? treeColorInputs.get(field.key);
    if (!pair) continue;
    const value = generalDraftStyle[field.key].toLowerCase();
    pair.text.value = value;
    if (HEX_COLOR_RE.test(value)) pair.picker.value = value;
  }
}

function updateImageSizeSettingsVisibility(): void {
  generalImageSizeSettings.hidden = !generalShowImagesInput.checked;
}

function updateReplyNotificationOptionsVisibility(): void {
  generalReplyNotificationOptions.hidden = !generalReplyNotificationEnabledInput.checked;
}

function updateViewingModeIntervalVisibility(): void {
  generalViewingModeIntervalSettings.hidden = !generalViewingModeEnabledInput.checked;
}

function commitGeneralSettingsForm(): void {
  if (!generalDraftGlobal || !generalDraftStyle) return;
  generalDraftStyle.system_font_family = generalSystemFontFamilyInput.value.trim();
  generalDraftStyle.post_font_family = generalPostFontFamilyInput.value.trim();

  const systemFontSize = Number.parseInt(generalSystemFontSizeInput.value, 10);
  if (Number.isFinite(systemFontSize)) generalDraftStyle.system_font_size_px = systemFontSize;
  const postFontSize = Number.parseInt(generalPostFontSizeInput.value, 10);
  if (Number.isFinite(postFontSize)) generalDraftStyle.post_font_size_px = postFontSize;

  for (const field of ALL_STYLE_COLOR_FIELDS) {
    const pair = postColorInputs.get(field.key) ?? advancedPostColorInputs.get(field.key) ?? treeColorInputs.get(field.key);
    if (!pair) continue;
    generalDraftStyle[field.key] = pair.text.value.trim().toLowerCase();
  }

  const pollInterval = Number.parseInt(generalPollIntervalInput.value, 10);
  if (Number.isFinite(pollInterval)) generalDraftGlobal.poll_interval_seconds = pollInterval;
  const maxPosts = Number.parseInt(generalMaxPostsInput.value, 10);
  if (Number.isFinite(maxPosts)) generalDraftGlobal.max_posts = maxPosts;
  generalDraftGlobal.post_saving_enabled = generalPostSavingEnabledInput.checked;
  generalDraftGlobal.tree_view_enabled = generalTreeViewEnabledInput.checked;
  generalDraftGlobal.hide_tree_link = !generalHideTreeLinkInput.checked;
  generalDraftGlobal.hide_thread_hide_link = !generalHideThreadHideLinkInput.checked;
  generalDraftGlobal.show_post_images = generalShowImagesInput.checked;
  generalDraftGlobal.show_fxtwitter_previews = generalShowFxTwitterPreviewsInput.checked;
  generalDraftGlobal.show_youtube_previews = generalShowYouTubePreviewsInput.checked;
  updateImageSizeSettingsVisibility();
  generalDraftGlobal.expand_numeric_character_references = generalExpandNumericCharacterReferencesInput.checked;
  generalDraftGlobal.show_image_detail_link = generalShowImageDetailInput.checked;
  const imageMaxHeight = Number.parseInt(generalImageMaxHeightInput.value, 10);
  if (Number.isFinite(imageMaxHeight)) generalDraftGlobal.max_image_height_px = imageMaxHeight;
  const imageHoverWindowPercent = Number.parseInt(generalImageHoverWindowPercentInput.value, 10);
  if (Number.isFinite(imageHoverWindowPercent)) generalDraftGlobal.image_hover_window_percent = imageHoverWindowPercent;
  generalDraftGlobal.keyboard_shortcuts_enabled = generalKeyboardShortcutsEnabledInput.checked;
  generalDraftGlobal.viewing_mode_enabled = generalViewingModeEnabledInput.checked;
  const viewingModeInterval = Number.parseInt(generalViewingModeIntervalInput.value, 10);
  if (Number.isFinite(viewingModeInterval)) generalDraftGlobal.viewing_mode_interval_seconds = viewingModeInterval;
  updateViewingModeIntervalVisibility();
  generalDraftGlobal.reply_notification_enabled = generalReplyNotificationEnabledInput.checked;
  updateReplyNotificationOptionsVisibility();
  generalDraftGlobal.reply_notification_include_descendants = generalReplyNotificationIncludeDescendantsInput.checked;
  generalDraftGlobal.reply_notification_sound_enabled = generalReplyNotificationSoundEnabledInput.checked;
  generalDraftStyle.current_post_border_color = generalCurrentPostBorderColorInput.value.trim().toLowerCase();
  generalDraftGlobal.ng_handle_patterns = generalNgHandlePatternsInput.value;
  generalDraftGlobal.ng_body_patterns = generalNgBodyPatternsInput.value;
  generalDraftGlobal.highlight_handle_patterns = generalHighlightHandlePatternsInput.value;
  generalDraftGlobal.highlight_body_patterns = generalHighlightBodyPatternsInput.value;
  generalDraftStyle.highlight_text_color = generalHighlightTextColorInput.value.trim().toLowerCase();
  generalDraftStyle.highlight_background_color = generalHighlightBackgroundColorInput.value.trim().toLowerCase();
}

function previewGeneralStyleSettings(): void {
  const root = document.documentElement.style;
  const systemFamily = generalSystemFontFamilyInput.value.trim();
  const postFamily = generalPostFontFamilyInput.value.trim();
  const systemFontSize = Number.parseInt(generalSystemFontSizeInput.value, 10);
  const postFontSize = Number.parseInt(generalPostFontSizeInput.value, 10);

  if (systemFamily && !/[;{}\r\n]/.test(systemFamily)) root.setProperty('--system-font-family', systemFamily);
  if (postFamily && !/[;{}\r\n]/.test(postFamily)) root.setProperty('--post-font-family', postFamily);
  if (Number.isFinite(systemFontSize) && systemFontSize >= 8 && systemFontSize <= 72) {
    root.setProperty('--system-font-size', `${systemFontSize}px`);
  }
  if (Number.isFinite(postFontSize) && postFontSize >= 8 && postFontSize <= 72) {
    root.setProperty('--post-font-size', `${postFontSize}px`);
  }

  const imageMaxHeight = Number.parseInt(generalImageMaxHeightInput.value, 10);
  if (Number.isFinite(imageMaxHeight) && imageMaxHeight >= 1 && imageMaxHeight <= 10000) {
    root.setProperty('--reader-image-max-height', `${imageMaxHeight}px`);
  }

  const imageHoverWindowPercent = Number.parseInt(generalImageHoverWindowPercentInput.value, 10);
  if (Number.isFinite(imageHoverWindowPercent) && imageHoverWindowPercent >= 1 && imageHoverWindowPercent <= 100) {
    root.setProperty('--reader-image-hover-max-width', `${imageHoverWindowPercent}vw`);
    root.setProperty('--reader-image-hover-max-height', `${imageHoverWindowPercent}vh`);
  }

  const currentPostBorderColor = generalCurrentPostBorderColorInput.value.trim();
  if (HEX_COLOR_RE.test(currentPostBorderColor)) root.setProperty('--current-post-border-color', currentPostBorderColor);

  const highlightTextColor = generalHighlightTextColorInput.value.trim();
  if (HEX_COLOR_RE.test(highlightTextColor)) root.setProperty('--post-highlight-text-color', highlightTextColor);
  const highlightBackgroundColor = generalHighlightBackgroundColorInput.value.trim();
  if (HEX_COLOR_RE.test(highlightBackgroundColor)) root.setProperty('--post-highlight-background-color', highlightBackgroundColor);

  for (const field of ALL_STYLE_COLOR_FIELDS) {
    const pair = postColorInputs.get(field.key) ?? advancedPostColorInputs.get(field.key) ?? treeColorInputs.get(field.key);
    if (!pair) continue;
    const value = pair.text.value.trim();
    if (HEX_COLOR_RE.test(value)) root.setProperty(STYLE_COLOR_VAR_MAP[field.key], value);
  }
}

function validateFontFamily(label: string, family: string): string | null {
  if (!family) return `${label}を入力してください。`;
  if (/[;{}\r\n]/.test(family) || family.includes('/*') || family.includes('*/')) {
    return `${label}にCSS構文を壊す文字は使用できません。`;
  }
  return null;
}

function validateNgPatterns(label: string, raw: string): string | null {
  try {
    compileNgPattern(raw);
    return null;
  } catch (error) {
    return `${label}の正規表現が不正です: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function updatePollIntervalWarning(): void {
  const value = Number.parseInt(generalPollIntervalInput.value, 10);
  const shouldWarn = Number.isFinite(value) && value <= MIN_UNREAD_RELOAD_INTERVAL_SECONDS;
  generalPollIntervalWarning.hidden = !shouldWarn;
}

function safePollIntervalSeconds(rawSeconds: number): number {
  if (!Number.isFinite(rawSeconds) || rawSeconds <= MIN_UNREAD_RELOAD_INTERVAL_SECONDS) {
    return MIN_UNREAD_RELOAD_INTERVAL_SECONDS;
  }
  return Math.floor(rawSeconds);
}

function safeViewingModeIntervalSeconds(rawSeconds: number): number {
  if (!Number.isFinite(rawSeconds) || rawSeconds < 1 || rawSeconds > MAX_VIEWING_MODE_INTERVAL_SECONDS) {
    return DEFAULT_VIEWING_MODE_INTERVAL_SECONDS;
  }
  return Math.floor(rawSeconds);
}

function validateGeneralSettings(): string | null {
  commitGeneralSettingsForm();
  if (!generalDraftGlobal || !generalDraftStyle) return '一般設定を読み込めませんでした。';

  const systemFontError = validateFontFamily('システム用フォントファミリー', generalDraftStyle.system_font_family);
  if (systemFontError) return systemFontError;
  const postFontError = validateFontFamily('投稿表示用フォントファミリー', generalDraftStyle.post_font_family);
  if (postFontError) return postFontError;

  if (!Number.isInteger(generalDraftStyle.system_font_size_px) || generalDraftStyle.system_font_size_px < 8 || generalDraftStyle.system_font_size_px > 72) {
    return 'システム用フォントサイズは8〜72pxで指定してください。';
  }
  if (!Number.isInteger(generalDraftStyle.post_font_size_px) || generalDraftStyle.post_font_size_px < 8 || generalDraftStyle.post_font_size_px > 72) {
    return '投稿表示用フォントサイズは8〜72pxで指定してください。';
  }

  for (const field of POST_COLOR_FIELDS) {
    const value = generalDraftStyle[field.key];
    if (!HEX_COLOR_RE.test(value)) return `${field.label}は #RRGGBB 形式で指定してください。`;
  }

  const pollIntervalInputValue = Number.parseInt(generalPollIntervalInput.value, 10);
  if (!Number.isInteger(pollIntervalInputValue) || pollIntervalInputValue < MIN_UNREAD_RELOAD_INTERVAL_SECONDS || pollIntervalInputValue > 86400) {
    return '未読リロード間隔は30〜86400秒で指定してください。';
  }
  generalDraftGlobal.poll_interval_seconds = pollIntervalInputValue;
  if (!Number.isInteger(generalDraftGlobal.max_posts) || generalDraftGlobal.max_posts < 1 || generalDraftGlobal.max_posts > 100000) {
    return '投稿表示上限数は1〜100000件で指定してください。';
  }
  if (!Number.isInteger(generalDraftGlobal.max_image_height_px) || generalDraftGlobal.max_image_height_px < 1 || generalDraftGlobal.max_image_height_px > 10000) {
    return '画像サムネイル最大高は1〜10000pxで指定してください。';
  }
  if (!Number.isInteger(generalDraftGlobal.image_hover_window_percent) || generalDraftGlobal.image_hover_window_percent < 1 || generalDraftGlobal.image_hover_window_percent > 100) {
    return 'ホバー画像サイズはウィンドウサイズの1〜100%で指定してください。';
  }
  const handleNgError = validateNgPatterns('ハンドルNGワード', generalDraftGlobal.ng_handle_patterns ?? '');
  if (handleNgError) return handleNgError;
  const bodyNgError = validateNgPatterns('本文NGワード', generalDraftGlobal.ng_body_patterns ?? '');
  if (bodyNgError) return bodyNgError;
  const handleHighlightError = validateNgPatterns('ハンドルのハイライト', generalDraftGlobal.highlight_handle_patterns ?? '');
  if (handleHighlightError) return handleHighlightError;
  const bodyHighlightError = validateNgPatterns('本文のハイライト', generalDraftGlobal.highlight_body_patterns ?? '');
  if (bodyHighlightError) return bodyHighlightError;
  if (!HEX_COLOR_RE.test(generalDraftStyle.highlight_text_color)) return 'ハイライト文字色は #RRGGBB 形式で指定してください。';
  if (!HEX_COLOR_RE.test(generalDraftStyle.highlight_background_color)) return 'ハイライト背景色は #RRGGBB 形式で指定してください。';
  if (!HEX_COLOR_RE.test(generalDraftStyle.current_post_border_color)) return '現在の投稿の枠色は #RRGGBB 形式で指定してください。';
  return null;
}

function discardGeneralSettings(): void {
  if (savedReaderStyle) applyReaderStyle(savedReaderStyle);
  if (config) applyDisplayConfig(config.global);
  generalDraftGlobal = config ? structuredClone(config.global) : null;
  generalDraftStyle = savedReaderStyle ? structuredClone(savedReaderStyle) : null;
  notificationSoundDraftPath = null;
  notificationSoundDraftName = null;
  notificationSoundResetRequested = false;
  setGeneralSettingsDirty(false);
  showGeneralSettingsMessage('');
  if (bbsSettingsDirty) {
    switchSettingsTab('bbs');
    showBbsSettingsMessage('BBS設定に未保存の変更が残っています。');
    return;
  }
  hideSettingsDialog();
}

async function saveGeneralSettings(): Promise<void> {
  const validationError = validateGeneralSettings();
  if (validationError) {
    showGeneralSettingsMessage(validationError, true);
    return;
  }
  if (!generalDraftGlobal || !generalDraftStyle) return;

  generalSaveButton.disabled = true;
  generalDiscardButton.disabled = true;
  showGeneralSettingsMessage('global.toml / reader-style.css に保存しています…');
  try {
    const result = await invoke<GeneralSettingsResult>('save_general_settings', {
      global: generalDraftGlobal,
      style: generalDraftStyle,
      customSoundSourcePath: notificationSoundDraftPath,
      resetNotificationSound: notificationSoundResetRequested,
    });
    config = result.config;
    savedReaderStyle = result.style;
    generalDraftGlobal = structuredClone(result.config.global);
    generalDraftStyle = structuredClone(result.style);
    notificationSoundDraftPath = null;
    notificationSoundDraftName = null;
    notificationSoundResetRequested = false;
    applyReaderStyle(result.style);
    applyDisplayConfig(result.config.global);
    mergePosts([]);
    await refreshReplyNotificationUiState();
    renderPosts();
    startReloadTimer();
    renderGeneralSettingsForm();
    setGeneralSettingsDirty(false);
    showGeneralSettingsMessage('保存・反映しました。');
  } catch (error) {
    showGeneralSettingsMessage(String(error), true);
  } finally {
    generalSaveButton.disabled = false;
    generalDiscardButton.disabled = !generalSettingsDirty;
  }
}

async function playReplyNotificationSound(): Promise<void> {
  const global = config?.global;
  if (!global || !global.reply_notification_sound_enabled) return;

  try {
    const raw = await invoke<ArrayBuffer | Uint8Array>('get_reply_notification_sound');
    const bytes = raw instanceof ArrayBuffer
      ? raw
      : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const soundName = global.reply_notification_sound_kind === 'custom'
      ? (global.reply_notification_sound_custom_name.trim() || 'notification')
      : 'notify.wav';
    const blob = new Blob([bytes], { type: notificationSoundMimeType(soundName) });
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    try {
      await audio.play();
    } catch (error) {
      cleanup();
      throw error;
    }
  } catch (error) {
    setReplyNotificationFooterError(`通知音を再生できませんでした: ${String(error)}`);
  }
}

async function fetchOneSite(site: SiteConfig, mode: 'initial' | 'reload'): Promise<SiteFetchResult> {
  const command = mode === 'initial' ? 'fetch_site_initial' : 'reload_site_unread';
  return invoke<SiteFetchResult>(command, { siteId: site.id });
}

async function runFetchCycle(forceInitial = false): Promise<void> {
  if (!config || requestInFlight || bbsActionSubmitInFlight) return;

  // 設定ファイルを手動編集された場合や、手動ボタンなど別経路から連続実行された場合でも、
  // BBSへ30秒未満の間隔でアクセスしない。初回GET直後の未読リロードも同様に抑制する。
  const now = Date.now();
  const includesUnreadReload = !forceInitial && enabledSites.some((site) => initializedSites.has(site.id));
  if (includesUnreadReload && lastBbsRequestStartedAtMs > 0 && now - lastBbsRequestStartedAtMs < MIN_UNREAD_RELOAD_INTERVAL_SECONDS * 1000) {
    return;
  }
  if (includesUnreadReload && !canStartUnreadReload(lastBbsDataFetchedAtMs, now)) {
    return;
  }
  lastBbsRequestStartedAtMs = now;

  requestInFlight = true;
  updateUnreadReloadButton();

  try {
    const outcomes = await Promise.all(enabledSites.map(async (site) => {
      siteNames.set(site.id, site.name);
      siteBaseUrls.set(site.id, site.fetch.url);

      const mode: 'initial' | 'reload' = forceInitial || !initializedSites.has(site.id) ? 'initial' : 'reload';
      try {
        const result = await fetchOneSite(site, mode);
        return { site, mode, result, error: null as string | null };
      } catch (error) {
        return { site, mode, result: null as SiteFetchResult | null, error: String(error) };
      }
    }));

    const successfulResults: SiteFetchResult[] = [];

    for (const outcome of outcomes) {
      if (outcome.result) {
        initializedSites.add(outcome.site.id);
        successfulResults.push(outcome.result);
        mergePosts(outcome.result.posts);
        // 同じBBSが正常取得できた時点で、そのBBSの過去の取得エラーは解消扱いにする。
        siteFetchErrors.delete(outcome.site.id);
      } else if (outcome.error) {
        siteFetchErrors.set(outcome.site.id, { siteName: outcome.site.name, message: outcome.error });
      }
    }

    // 保存済み既読位置がなく、初回GETが成功したときだけ、その時点の最新投稿を既読基準にする。
    // リセット後の次回GETでも同じ基準を作り、既存ログが一斉に未読になるのを防ぐ。
    if (!readCursor && outcomes.some((outcome) => outcome.result && outcome.mode === 'initial')) {
      initializeReadCursorIfNeeded();
    }

    const trackingErrors = successfulResults
      .map((result) => result.reply_notification_error?.trim() ?? '')
      .filter(Boolean);
    await refreshReplyNotificationUiState();
    if (trackingErrors.length > 0) {
      setReplyNotificationFooterError(trackingErrors.join(' / '));
    }

    const notificationActions = replyNotificationActions(
      config.global.reply_notification_enabled,
      config.global.reply_notification_sound_enabled,
      successfulResults,
    );
    for (const postKey of notificationActions.reply_post_keys) {
      replyNotificationPostKeys.add(postKey);
      forcedUnreadPostKeys.add(postKey);
    }
    renderPosts();
    if (notificationActions.play_sound) {
      void playReplyNotificationSound();
    }

    const latestResult = successfulResults
      .slice()
      .sort((a, b) => Date.parse(b.fetched_at) - Date.parse(a.fetched_at))[0];
    if (latestResult) {
      lastFetchElement.textContent = formatFetchTime(latestResult.fetched_at);
      lastBbsDataFetchedAtMs = Date.now();
      scheduleUnreadReloadButtonUpdate();
    }

    renderFooterErrors();
  } finally {
    requestInFlight = false;
    updateUnreadReloadButton();
  }
}

function startReloadTimer(): void {
  if (!config) return;

  scheduleUnreadReloadButtonUpdate();

  if (reloadTimer !== null) {
    window.clearInterval(reloadTimer);
  }

  const intervalSeconds = safePollIntervalSeconds(config.global.poll_interval_seconds);
  reloadTimer = window.setInterval(() => {
    void runFetchCycle(false);
  }, intervalSeconds * 1000);
}

function startViewingModeTimer(): void {
  if (viewingModeTimer !== null) {
    window.clearInterval(viewingModeTimer);
    viewingModeTimer = null;
  }
  if (!config || !config.global.viewing_mode_enabled) return;

  const intervalSeconds = safeViewingModeIntervalSeconds(config.global.viewing_mode_interval_seconds);
  viewingModeTimer = window.setInterval(moveToNextUnreadPost, intervalSeconds * 1000);
}

function jumpToUnreadBoundary(): void {
  const boundary = document.querySelector<HTMLElement>('#unread-boundary');
  if (boundary) {
    boundary.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const unreadPost = postsElement.querySelector<HTMLElement>('.post-unread');
  unreadPost?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const DEFAULT_TIMESTAMP_REGEX = String.raw`(?P<year>\d{4})/(?P<month>\d{2})/(?P<day>\d{2})\([^)]+\)\s*(?P<hour>\d{2})(?:時|:)(?P<minute>\d{2})(?:分|:)(?P<second>\d{2})(?:秒)?`;

function cloneSites(sites: SiteConfig[]): SiteConfig[] {
  return structuredClone(sites);
}

function makeUniqueBbsId(): string {
  const used = new Set(bbsEditorSites.map((site) => site.id));
  let index = bbsEditorSites.length + 1;
  while (used.has(`bbs-${index}`)) index += 1;
  return `bbs-${index}`;
}

function createDefaultSiteConfig(): SiteConfig {
  return {
    id: makeUniqueBbsId(),
    name: '新しいBBS',
    enabled: true,
    encoding: 'shift_jis',
    user_agent: 'AyashiiWorldReader/0.2 (+Tauri)',
    timezone_offset_minutes: 540,
    timezone_region: "日本",
    badge_style: {
      text_color: '#eefafa',
      background_color: '#0b5555',
      border_color: '#2f6262',
    },
    fetch: { url: '' },
    post_parser: {
      mode: 'legacy_anchor_siblings',
      anchor_selector: 'a[name]',
      id_attribute: 'name',
      header_tag: 'font',
      name_tag: 'b',
      info_tag: 'font',
      body_container_tag: 'blockquote',
      body_tag: 'pre',
      post_selector: '',
      post_id_attribute: 'id',
      post_id_prefix: '',
      title_selector: '',
      name_selector: '',
      date_selector: '',
      body_selector: '',
      date_prefix: '投稿日：',
      timestamp_regex: DEFAULT_TIMESTAMP_REGEX,
    },
    reload_form: {
      form_selector: 'form',
      submit_input_name: 'midokureload',
      submit_input_name_fallbacks: ['meload', 'readnew'],
      submit_value_regex: '未読',
      method: 'POST',
      referer: '',
      include_hidden: true,
    },
  };
}

function setBbsSettingsDirty(dirty: boolean): void {
  bbsSettingsDirty = dirty;
  bbsDirtyLabel.textContent = dirty ? '未保存の変更があります' : '変更なし';
  bbsDirtyLabel.classList.toggle('has-changes', dirty);
  bbsDiscardButton.disabled = !dirty;
}

function showBbsSettingsMessage(message: string, error = false): void {
  bbsSettingsMessage.textContent = message;
  bbsSettingsMessage.classList.toggle('settings-message-error', error);
}

function updateParserModeFields(): void {
  const cssMode = bbsParserModeInput.value === 'css_post';
  legacyParserFields.hidden = cssMode;
  cssParserFields.hidden = !cssMode;
}

function updateTimezoneCustomField(): void {
  bbsTimezoneCustomField.hidden = bbsTimezoneInput.value !== 'custom';
}

function bbsBadgeClassName(siteId: string): string {
  const normalized = siteId.trim().replace(/[^A-Za-z0-9_-]/g, '-');
  return `site-badge--${normalized || 'unknown'}`;
}

function normalizeBadgeStyle(site: SiteConfig): BbsBadgeStyleConfig {
  if (!site.badge_style) {
    site.badge_style = {
      text_color: '#eefafa',
      background_color: '#0b5555',
      border_color: '#2f6262',
    };
  }
  return site.badge_style;
}

function applyBbsBadgeStyles(sites: SiteConfig[]): void {
  let styleElement = document.querySelector<HTMLStyleElement>('#bbs-badge-dynamic-styles');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'bbs-badge-dynamic-styles';
    document.head.append(styleElement);
  }

  styleElement.textContent = sites.map((site) => {
    const badge = normalizeBadgeStyle(site);
    const text = HEX_COLOR_RE.test(badge.text_color) ? badge.text_color : '#eefafa';
    const background = HEX_COLOR_RE.test(badge.background_color) ? badge.background_color : '#0b5555';
    const border = HEX_COLOR_RE.test(badge.border_color) ? badge.border_color : '#2f6262';
    return `.${bbsBadgeClassName(site.id)} { --bbs-badge-text-color: ${text}; --bbs-badge-background-color: ${background}; --bbs-badge-border-color: ${border}; }`;
  }).join('\n');
}

function updateBbsBadgePreview(): void {
  const site = bbsEditorSites[selectedBbsIndex];
  if (!site) return;
  const className = bbsBadgeClassName(bbsIdInput.value.trim());
  bbsBadgeCssClassInput.value = `.${className}`;
  bbsBadgePreview.textContent = bbsNameInput.value.trim() || 'BBS名';
  bbsBadgePreview.className = `site-badge ${className}`;
  const text = bbsBadgeTextColorInput.value.trim();
  const background = bbsBadgeBackgroundColorInput.value.trim();
  const border = bbsBadgeBorderColorInput.value.trim();
  bbsBadgePreview.style.setProperty('--bbs-badge-text-color', HEX_COLOR_RE.test(text) ? text : '#eefafa');
  bbsBadgePreview.style.setProperty('--bbs-badge-background-color', HEX_COLOR_RE.test(background) ? background : '#0b5555');
  bbsBadgePreview.style.setProperty('--bbs-badge-border-color', HEX_COLOR_RE.test(border) ? border : '#2f6262');
}

function renderBbsSettingsList(): void {
  const fragment = document.createDocumentFragment();
  for (const [index, site] of bbsEditorSites.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bbs-list-item';
    button.dataset.index = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === selectedBbsIndex ? 'true' : 'false');
    if (index === selectedBbsIndex) button.classList.add('is-selected');
    if (!site.enabled) button.classList.add('is-disabled');

    const row = document.createElement('span');
    row.className = 'bbs-list-item-title';
    const indicator = document.createElement('span');
    indicator.className = site.enabled ? 'bbs-enabled-dot' : 'bbs-disabled-dot';
    const name = document.createElement('strong');
    name.textContent = site.name.trim() || '(名称未設定)';
    row.append(indicator, name);

    const url = document.createElement('small');
    url.textContent = site.fetch.url.trim() || 'URL未設定';
    button.append(row, url);
    fragment.append(button);
  }
  bbsSettingsList.replaceChildren(fragment);
}

function commitBbsEditorForm(): void {
  if (selectedBbsIndex < 0 || selectedBbsIndex >= bbsEditorSites.length) return;
  const site = bbsEditorSites[selectedBbsIndex];

  site.enabled = bbsEnabledInput.checked;
  site.id = bbsIdInput.value.trim();
  site.name = bbsNameInput.value.trim();
  site.encoding = bbsEncodingInput.value.trim();
  site.user_agent = bbsUserAgentInput.value.trim();
  const badge = normalizeBadgeStyle(site);
  badge.text_color = bbsBadgeTextColorInput.value.trim().toLowerCase();
  badge.background_color = bbsBadgeBackgroundColorInput.value.trim().toLowerCase();
  badge.border_color = bbsBadgeBorderColorInput.value.trim().toLowerCase();
  switch (bbsTimezoneInput.value) {
    case 'christmas-indian':
      site.timezone_offset_minutes = 420;
      site.timezone_region = 'インド洋のクリスマス島';
      break;
    case 'christmas-pacific':
      site.timezone_offset_minutes = 840;
      site.timezone_region = '太平洋のクリスマス島';
      break;
    case 'custom': {
      const customOffset = Number.parseInt(bbsTimezoneCustomOffsetInput.value, 10);
      site.timezone_offset_minutes = Number.isFinite(customOffset) ? customOffset : 540;
      site.timezone_region = 'カスタム';
      break;
    }
    case 'japan':
    default:
      site.timezone_offset_minutes = 540;
      site.timezone_region = '日本';
      break;
  }
  site.fetch.url = bbsUrlInput.value.trim();

  const parser = site.post_parser;
  parser.mode = bbsParserModeInput.value;
  parser.date_prefix = bbsDatePrefixInput.value;
  parser.timestamp_regex = bbsTimestampRegexInput.value.trim();
  parser.anchor_selector = bbsAnchorSelectorInput.value.trim();
  parser.id_attribute = bbsIdAttributeInput.value.trim();
  parser.header_tag = bbsHeaderTagInput.value.trim();
  parser.name_tag = bbsNameTagInput.value.trim();
  parser.info_tag = bbsInfoTagInput.value.trim();
  parser.body_container_tag = bbsBodyContainerTagInput.value.trim();
  parser.body_tag = bbsBodyTagInput.value.trim();
  parser.post_selector = bbsPostSelectorInput.value.trim();
  parser.post_id_attribute = bbsPostIdAttributeInput.value.trim();
  parser.post_id_prefix = bbsPostIdPrefixInput.value.trim();
  parser.title_selector = bbsTitleSelectorInput.value.trim();
  parser.name_selector = bbsNameSelectorInput.value.trim();
  parser.date_selector = bbsDateSelectorInput.value.trim();
  parser.body_selector = bbsBodySelectorInput.value.trim();

  const reload = site.reload_form;
  reload.form_selector = bbsFormSelectorInput.value.trim();
  reload.submit_input_name = bbsSubmitNameInput.value.trim();
  reload.submit_input_name_fallbacks = bbsSubmitFallbacksInput.value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  reload.submit_value_regex = bbsSubmitValueRegexInput.value.trim();
  reload.method = bbsMethodInput.value;
  reload.referer = bbsRefererInput.value.trim();
  reload.include_hidden = true;
}

function renderBbsEditor(): void {
  const site = bbsEditorSites[selectedBbsIndex];
  const hasSite = Boolean(site);
  bbsSettingsForm.hidden = !hasSite;
  bbsSettingsEmpty.hidden = hasSite;
  bbsDeleteButton.disabled = !hasSite;
  if (!site) return;

  bbsEnabledInput.checked = site.enabled;
  bbsIdInput.value = site.id;
  bbsNameInput.value = site.name;
  bbsUrlInput.value = site.fetch.url;
  bbsEncodingInput.value = site.encoding;
  if (!Array.from(bbsEncodingInput.options).some((option) => option.value === site.encoding)) {
    const option = document.createElement('option');
    option.value = site.encoding;
    option.textContent = site.encoding;
    bbsEncodingInput.append(option);
    bbsEncodingInput.value = site.encoding;
  }
  const timezoneOffset = site.timezone_offset_minutes ?? 540;
  if (timezoneOffset === 420 && site.timezone_region === 'インド洋のクリスマス島') {
    bbsTimezoneInput.value = 'christmas-indian';
  } else if (timezoneOffset === 840 && site.timezone_region === '太平洋のクリスマス島') {
    bbsTimezoneInput.value = 'christmas-pacific';
  } else if (timezoneOffset === 540 && (!site.timezone_region || site.timezone_region === '日本' || site.timezone_region === '東京')) {
    bbsTimezoneInput.value = 'japan';
  } else {
    bbsTimezoneInput.value = 'custom';
  }
  bbsTimezoneCustomOffsetInput.value = String(timezoneOffset);
  updateTimezoneCustomField();
  bbsUserAgentInput.value = site.user_agent;
  const badge = normalizeBadgeStyle(site);
  bbsBadgeTextColorInput.value = badge.text_color.toLowerCase();
  bbsBadgeBackgroundColorInput.value = badge.background_color.toLowerCase();
  bbsBadgeBorderColorInput.value = badge.border_color.toLowerCase();
  if (HEX_COLOR_RE.test(badge.text_color)) bbsBadgeTextColorPicker.value = badge.text_color;
  if (HEX_COLOR_RE.test(badge.background_color)) bbsBadgeBackgroundColorPicker.value = badge.background_color;
  if (HEX_COLOR_RE.test(badge.border_color)) bbsBadgeBorderColorPicker.value = badge.border_color;
  updateBbsBadgePreview();

  bbsParserModeInput.value = site.post_parser.mode;
  bbsDatePrefixInput.value = site.post_parser.date_prefix;
  bbsTimestampRegexInput.value = site.post_parser.timestamp_regex;
  bbsAnchorSelectorInput.value = site.post_parser.anchor_selector;
  bbsIdAttributeInput.value = site.post_parser.id_attribute;
  bbsHeaderTagInput.value = site.post_parser.header_tag;
  bbsNameTagInput.value = site.post_parser.name_tag;
  bbsInfoTagInput.value = site.post_parser.info_tag;
  bbsBodyContainerTagInput.value = site.post_parser.body_container_tag;
  bbsBodyTagInput.value = site.post_parser.body_tag;
  bbsPostSelectorInput.value = site.post_parser.post_selector;
  bbsPostIdAttributeInput.value = site.post_parser.post_id_attribute;
  bbsPostIdPrefixInput.value = site.post_parser.post_id_prefix;
  bbsTitleSelectorInput.value = site.post_parser.title_selector;
  bbsNameSelectorInput.value = site.post_parser.name_selector;
  bbsDateSelectorInput.value = site.post_parser.date_selector;
  bbsBodySelectorInput.value = site.post_parser.body_selector;

  bbsFormSelectorInput.value = site.reload_form.form_selector;
  bbsMethodInput.value = site.reload_form.method.toUpperCase();
  bbsSubmitNameInput.value = site.reload_form.submit_input_name;
  bbsSubmitFallbacksInput.value = site.reload_form.submit_input_name_fallbacks.join(', ');
  bbsSubmitValueRegexInput.value = site.reload_form.submit_value_regex;
  bbsRefererInput.value = site.reload_form.referer;
  updateParserModeFields();
}

function selectBbsEditor(index: number): void {
  commitBbsEditorForm();
  selectedBbsIndex = index;
  renderBbsSettingsList();
  renderBbsEditor();
  showBbsSettingsMessage('');
}

function openSettings(): void {
  if (!config || !savedReaderStyle) return;

  generalDraftGlobal = structuredClone(config.global);
  generalDraftStyle = structuredClone(savedReaderStyle);
  notificationSoundDraftPath = null;
  notificationSoundDraftName = null;
  notificationSoundResetRequested = false;
  renderGeneralSettingsForm();
  setGeneralSettingsDirty(false);
  showGeneralSettingsMessage('');

  bbsEditorSites = cloneSites(config.sites);
  selectedBbsIndex = bbsEditorSites.length > 0 ? 0 : -1;
  setBbsSettingsDirty(false);
  showBbsSettingsMessage('');
  renderBbsSettingsList();
  renderBbsEditor();

  showSettingsDialog('general');
}

function addBbsEditor(): void {
  commitBbsEditorForm();
  const site = createDefaultSiteConfig();
  bbsEditorSites.push(site);
  selectedBbsIndex = bbsEditorSites.length - 1;
  setBbsSettingsDirty(true);
  renderBbsSettingsList();
  renderBbsEditor();
  showBbsSettingsMessage('新しいBBSを追加しました。設定後に「保存して反映」を押してください。');
  bbsNameInput.focus();
  bbsNameInput.select();
}

function deleteSelectedBbs(): void {
  if (selectedBbsIndex < 0) return;
  commitBbsEditorForm();
  const site = bbsEditorSites[selectedBbsIndex];
  if (!site) return;

  // Tauri/macOS WebView の window.confirm() 実装差に依存しない。
  // ここでは編集用リストから即座に外すだけで、bbs.toml への反映は
  // 「保存して反映」を押した時点で確定する。「変更を破棄」なら元へ戻せる。
  const deletedLabel = site.name || site.id;
  bbsEditorSites.splice(selectedBbsIndex, 1);
  selectedBbsIndex = Math.min(selectedBbsIndex, bbsEditorSites.length - 1);
  setBbsSettingsDirty(true);
  renderBbsSettingsList();
  renderBbsEditor();
  showBbsSettingsMessage(`「${deletedLabel}」を削除候補にしました。「保存して反映」で確定します。`);
}

function discardBbsSettings(): void {
  if (!bbsSettingsDirty || !config) return;

  // 編集用BBS設定だけを保存済み状態へ戻す。
  const previousIndex = selectedBbsIndex;
  bbsEditorSites = cloneSites(config.sites);
  if (bbsEditorSites.length === 0) {
    selectedBbsIndex = -1;
  } else {
    selectedBbsIndex = Math.min(Math.max(previousIndex, 0), bbsEditorSites.length - 1);
  }

  setBbsSettingsDirty(false);
  showBbsSettingsMessage('');
  renderBbsSettingsList();
  renderBbsEditor();

  if (generalSettingsDirty) {
    switchSettingsTab('general');
    showGeneralSettingsMessage('一般設定に未保存の変更が残っています。');
    return;
  }
  hideSettingsDialog();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateBbsEditorSites(sites: SiteConfig[]): string | null {
  const ids = new Set<string>();
  for (const [index, site] of sites.entries()) {
    const label = site.name || `BBS ${index + 1}`;
    if (!/^[A-Za-z0-9_-]+$/.test(site.id)) return `${label}: BBS IDは英数字・-・_で指定してください。`;
    if (ids.has(site.id)) return `${label}: BBS ID「${site.id}」が重複しています。`;
    ids.add(site.id);
    if (!site.name) return `BBS ${index + 1}: 表示名を入力してください。`;
    if (!isHttpUrl(site.fetch.url)) return `${label}: 取得先URLをHTTP(S) URLで入力してください。`;
    if (!site.encoding) return `${label}: 文字コードを指定してください。`;
    if (!site.user_agent) return `${label}: User-Agentを入力してください。`;
    if (!Number.isFinite(site.timezone_offset_minutes) || Math.abs(site.timezone_offset_minutes) > 1440) {
      return `${label}: タイムゾーンのUTCオフセットが不正です。`;
    }
    const badge = normalizeBadgeStyle(site);
    if (!HEX_COLOR_RE.test(badge.text_color)) return `${label}: BBS名バッジの文字色は #RRGGBB 形式で指定してください。`;
    if (!HEX_COLOR_RE.test(badge.background_color)) return `${label}: BBS名バッジの背景色は #RRGGBB 形式で指定してください。`;
    if (!HEX_COLOR_RE.test(badge.border_color)) return `${label}: BBS名バッジの枠色は #RRGGBB 形式で指定してください。`;
    if (!site.post_parser.timestamp_regex) return `${label}: 日時正規表現を入力してください。`;

    if (site.post_parser.mode === 'legacy_anchor_siblings') {
      const required = [
        site.post_parser.anchor_selector,
        site.post_parser.id_attribute,
        site.post_parser.header_tag,
        site.post_parser.name_tag,
        site.post_parser.info_tag,
        site.post_parser.body_container_tag,
        site.post_parser.body_tag,
      ];
      if (required.some((value) => !value)) return `${label}: 旧くずは系パーサの必須項目が空です。`;
    } else if (site.post_parser.mode === 'css_post') {
      if (!site.post_parser.post_selector || !site.post_parser.post_id_attribute || !site.post_parser.date_selector || !site.post_parser.body_selector) {
        return `${label}: CSSセレクタ型パーサの投稿・ID・投稿日・本文selectorを入力してください。`;
      }
    } else {
      return `${label}: 未対応の投稿解析方式です。`;
    }

    if (!site.reload_form.form_selector) return `${label}: FORM selectorを入力してください。`;
    if (!site.reload_form.submit_input_name && site.reload_form.submit_input_name_fallbacks.length === 0 && !site.reload_form.submit_value_regex) {
      return `${label}: 未読リロードsubmitの判定条件を1つ以上指定してください。`;
    }
    if (!isHttpUrl(site.reload_form.referer)) return `${label}: RefererをHTTP(S) URLで入力してください。`;
  }
  return null;
}


async function applyBbsConfigAfterSave(loadedConfig: ReaderConfig): Promise<void> {
  config = loadedConfig;
  if (selectedBbsTimelineSiteId !== null && !loadedConfig.sites.some((site) => site.id === selectedBbsTimelineSiteId && site.enabled)) {
    selectedBbsTimelineSiteId = null;
  }
  renderBbsTimelineMenu();
  enabledSites = loadedConfig.sites.filter((site) => site.enabled);
  newPostButton.disabled = enabledSites.length === 0;
  applyBbsBadgeStyles(loadedConfig.sites);
  initializedSites.clear();
  lastBbsRequestStartedAtMs = 0;
  lastBbsDataFetchedAtMs = null;
  scheduleUnreadReloadButtonUpdate();
  siteFetchErrors.clear();
  siteNames.clear();
  siteBaseUrls.clear();
  for (const site of enabledSites) {
    siteNames.set(site.id, site.name);
    siteBaseUrls.set(site.id, site.fetch.url);
  }
  // BBS IDやURL、パーサが変わった可能性があるため、保存後は古い投稿を残さず全サイトを取り直す。
  postsByKey.clear();
  persistPostLog();
  renderPosts();

  if (reloadTimer !== null) {
    window.clearInterval(reloadTimer);
    reloadTimer = null;
  }

  if (enabledSites.length === 0) {
    noticeElement.hidden = false;
    noticeElement.textContent = 'BBS設定から取得先を追加するか、BBSを有効にしてください。';
    setFooterError(null);
    return;
  }

  await runFetchCycle(true);
  startReloadTimer();
}

async function saveBbsSettings(): Promise<void> {
  commitBbsEditorForm();
  const validationError = validateBbsEditorSites(bbsEditorSites);
  if (validationError) {
    showBbsSettingsMessage(validationError, true);
    return;
  }
  if (requestInFlight) {
    showBbsSettingsMessage('掲示板の取得中です。取得完了後にもう一度保存してください。', true);
    return;
  }

  bbsSaveButton.disabled = true;
  bbsDeleteButton.disabled = true;
  showBbsSettingsMessage('bbs.toml に保存しています…');
  try {
    const loadedConfig = await invoke<ReaderConfig>('save_bbs_config', { sites: bbsEditorSites });
    bbsEditorSites = cloneSites(loadedConfig.sites);
    if (bbsEditorSites.length === 0) {
      selectedBbsIndex = -1;
    } else {
      selectedBbsIndex = Math.min(Math.max(selectedBbsIndex, 0), bbsEditorSites.length - 1);
    }
    setBbsSettingsDirty(false);
    renderBbsSettingsList();
    renderBbsEditor();
    showBbsSettingsMessage('保存しました。変更後のBBS設定で再取得しています。');
    await applyBbsConfigAfterSave(loadedConfig);
    showBbsSettingsMessage('保存・反映が完了しました。');
  } catch (error) {
    showBbsSettingsMessage(String(error), true);
  } finally {
    bbsSaveButton.disabled = false;
    bbsDeleteButton.disabled = selectedBbsIndex < 0;
  }
}

function formatResetDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

function renderResetItems<T extends { site_id: string; created_at: string }>(
  target: HTMLElement,
  items: T[],
  idLabel: string,
  idOf: (item: T) => string,
): void {
  target.replaceChildren();
  if (items.length === 0) {
    target.textContent = '登録されている項目はありません。';
    return;
  }
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'reset-item-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.siteId = item.site_id;
    checkbox.dataset.itemId = idOf(item);
    const details = document.createElement('span');
    details.textContent = `BBS名：${siteNames.get(item.site_id) ?? item.site_id}　${idLabel}：${idOf(item)}　登録日：${formatResetDate(item.created_at)}`;
    row.append(checkbox, details);
    target.append(row);
  }
}

function selectedResetItems(target: HTMLElement): Array<{ site_id: string; id: string }> {
  return [...target.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => ({
    site_id: input.dataset.siteId ?? '',
    id: input.dataset.itemId ?? '',
  })).filter((item) => item.site_id && item.id);
}

async function refreshResetSettings(): Promise<void> {
  try {
    const [tracked, hidden] = await Promise.all([
      invoke<ResetReplyNotification[]>('get_reply_notification_tracked_roots'),
      invoke<ResetHiddenThread[]>('get_hidden_threads'),
    ]);
    renderResetItems(resetReplyNotificationList, tracked, '投稿ID', (item) => item.post_id);
    renderResetItems(resetHiddenThreadList, hidden, 'スレッドID', (item) => item.thread_id);
    resetRemoveReplyNotificationsButton.disabled = true;
    resetRemoveHiddenThreadsButton.disabled = true;
  } catch (error) {
    setFooterError(`リセット項目を読み込めませんでした: ${String(error)}`);
  }
}

async function removeSelectedReplyNotifications(): Promise<void> {
  const targets = selectedResetItems(resetReplyNotificationList).map(({ site_id, id }) => ({ site_id, post_id: id }));
  if (targets.length === 0) return;
  await invoke('remove_reply_notification_tracked_roots', { targets });
  await refreshReplyNotificationUiState();
  await refreshResetSettings();
}

async function removeSelectedHiddenThreads(): Promise<void> {
  const targets = selectedResetItems(resetHiddenThreadList).map(({ site_id, id }) => ({ site_id, thread_id: id, created_at: new Date(0).toISOString() }));
  if (targets.length === 0) return;
  await invoke('remove_hidden_threads', { targets });
  await refreshHiddenThreadKeys();
  renderPosts();
  await refreshResetSettings();
}

async function resetConfigToBundled(fileName: 'global.toml' | 'bbs.toml'): Promise<void> {
  if (fileName === 'bbs.toml' && requestInFlight) {
    setFooterError('掲示板の取得中です。取得完了後にもう一度実行してください。');
    return;
  }

  try {
    const loadedConfig = await invoke<ReaderConfig>('reset_config_to_bundled', { fileName });
    if (fileName === 'global.toml') {
      config = loadedConfig;
      generalDraftGlobal = structuredClone(loadedConfig.global);
      notificationSoundDraftPath = null;
      notificationSoundDraftName = null;
      notificationSoundResetRequested = false;
      applyDisplayConfig(loadedConfig.global);
      mergePosts([]);
      renderGeneralSettingsForm();
      setGeneralSettingsDirty(false);
      await refreshReplyNotificationUiState();
      renderPosts();
      startReloadTimer();
      showResetSettingsMessage('リセット成功しました');
      return;
    }

    bbsEditorSites = cloneSites(loadedConfig.sites);
    selectedBbsIndex = bbsEditorSites.length > 0 ? 0 : -1;
    setBbsSettingsDirty(false);
    renderBbsSettingsList();
    renderBbsEditor();
    await applyBbsConfigAfterSave(loadedConfig);
    showResetSettingsMessage('リセット成功しました');
  } catch (error) {
    showResetSettingsMessage(`${fileName}をリセットできませんでした: ${String(error)}`, true);
  }
}

function resetUnreadState(): void {
  readCursor = null;
  try { localStorage.removeItem(READ_CURSOR_STORAGE_KEY); } catch { /* in-memory state was reset */ }
  renderPosts();
}

function resetPostLog(): void {
  try { clearPostLog(localStorage, POST_LOG_STORAGE_KEY); } catch { /* no persisted log available */ }
}

const runStartupUpdateSequence = createStartupUpdateSequence({
  runInitialFetch: () => runFetchCycle(true),
  startReloadTimer: () => startReloadTimer(),
  checkForAppUpdate,
});

async function bootstrap(): Promise<void> {
  try {
    const loadedConfig = await invoke<ReaderConfig>('get_reader_config');
    const loadedStyle = await invoke<ReaderStyleConfig>('get_reader_style');
    config = loadedConfig;
    enabledSites = loadedConfig.sites.filter((site) => site.enabled);
    renderBbsTimelineMenu();
    applyBbsBadgeStyles(loadedConfig.sites);
    savedReaderStyle = loadedStyle;
    settingsButton.disabled = false;
    newPostButton.disabled = enabledSites.length === 0;

    for (const site of enabledSites) {
      siteNames.set(site.id, site.name);
      siteBaseUrls.set(site.id, site.fetch.url);
    }

    applyReaderStyle(loadedStyle);
    applyDisplayConfig(loadedConfig.global);
    loadPostLog();
    loadSavedPosts();
    await refreshHiddenThreadKeys();
    await refreshReplyNotificationUiState();

    if (postsByKey.size > 0) {
      renderPosts();
    }

    if (enabledSites.length === 0) {
      noticeElement.textContent = 'BBS設定から取得先を追加するか、BBSを有効にしてください。';
    }

    await runStartupUpdateSequence(enabledSites.length > 0);
  } catch (error) {
    const message = String(error);
    setFooterError(message);
    noticeElement.hidden = false;
    noticeElement.textContent = '起動に失敗しました。詳細は画面下部のERROR欄を確認してください。';
    noticeElement.classList.remove('notice-error');
  }
}

function showImageHoverPopup(thumbnail: HTMLImageElement): void {
  const url = thumbnail.dataset.externalUrl || thumbnail.currentSrc || thumbnail.src;
  if (!url) return;

  imageHoverPopupImage.src = url;
  imageHoverPopupImage.alt = thumbnail.alt || '画像プレビュー';
  imageHoverPopup.hidden = false;
  imageHoverPopup.setAttribute('aria-hidden', 'false');
}

function hideImageHoverPopup(): void {
  imageHoverPopup.hidden = true;
  imageHoverPopup.setAttribute('aria-hidden', 'true');
  imageHoverPopupImage.removeAttribute('src');
}

function handleImageThumbnailMouseOver(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const thumbnail = target.closest<HTMLImageElement>('img.post-image-thumbnail');
  if (!thumbnail) return;
  if (event.relatedTarget instanceof Node && thumbnail.contains(event.relatedTarget)) return;
  showImageHoverPopup(thumbnail);
}

function handleImageThumbnailMouseOut(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const thumbnail = target.closest<HTMLImageElement>('img.post-image-thumbnail');
  if (!thumbnail) return;
  if (event.relatedTarget instanceof Node && thumbnail.contains(event.relatedTarget)) return;
  hideImageHoverPopup();
}

function handlePostContentClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const clickedPost = target.closest<HTMLElement>('article.post[data-post-key]');
  if (clickedPost && postsElement.contains(clickedPost)) setCurrentPostElement(clickedPost, false);

  const actionTarget = target.closest<HTMLElement>('[data-bbs-action-href]');
  if (actionTarget) {
    event.preventDefault();
    const href = actionTarget.dataset.bbsActionHref;
    const siteId = actionTarget.dataset.bbsActionSiteId;
    const kind = actionTarget.dataset.bbsActionKind;
    if (!href || !siteId || (kind !== 'follow' && kind !== 'thread' && kind !== 'tree')) return;
    void openBbsActionView(siteId, href, kind);
    return;
  }

  const externalTarget = target.closest<HTMLElement>('[data-external-url]');
  if (!externalTarget) return;

  event.preventDefault();
  const url = externalTarget.dataset.externalUrl;
  if (!url) return;

  markExternalElementVisited(externalTarget, url);

  void openUrl(url).catch((error: unknown) => {
    const message = `リンクを開けませんでした: ${String(error)}`;
    setFooterError(message);
  });
}

function copiedPostPlainText(root: Node): string {
  const blockElements = new Set([
    'ARTICLE', 'BLOCKQUOTE', 'DIV', 'LI', 'P', 'PRE', 'SECTION', 'UL', 'OL',
  ]);
  const parts: string[] = [];

  const appendNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    node.childNodes.forEach(appendNode);
    const nextSibling = node.nextSibling;
    if (blockElements.has(node.tagName)) {
      const isTreePostHeader = node.classList.contains('tree-post-first-line');
      const isTreeThreadHeader = node.classList.contains('tree-thread-header');
      if (isTreePostHeader || isTreeThreadHeader) parts.push('\n');
      else if (!(nextSibling instanceof HTMLElement && blockElements.has(nextSibling.tagName))) parts.push('\n');
    }
  };

  root.childNodes.forEach(appendNode);
  const joined = parts.join('');
  const isTreeCopy = root instanceof Element && root.querySelector('.post-tree-node') !== null;
  const normalized = isTreeCopy
    ? joined.replace(/\n{2,}/gu, '\n')
    : joined.replace(/\n{3,}/gu, '\n\n');
  return normalized.replace(/\n$/u, '');
}

function formatCopiedPostHeaders(root: DocumentFragment): void {
  root.querySelectorAll<HTMLElement>('.post-meta-primary').forEach((header) => {
    const title = header.querySelector('.post-subject')?.textContent?.trim() ?? '';
    const author = header.querySelector('.post-name')?.textContent?.trim() ?? '';
    const postedAt = header.querySelector('.post-time')?.textContent?.trim() ?? '';
    const actions = header.querySelector('.post-action-links')?.textContent ?? '';
    header.replaceChildren(document.createTextNode(formatCopiedPostFirstLine({ title, author, postedAt, actions })));
  });
}

async function copyPostToClipboard(post: ParsedPost): Promise<void> {
  const article = Array.from(document.querySelectorAll<HTMLElement>('article.post[data-post-key]'))
    .find((element) => element.dataset.postKey === postKey(post));
  if (!article) return;

  const copyRoot = document.createDocumentFragment();
  copyRoot.append(article.cloneNode(true));
  copyRoot.querySelectorAll(POST_COPY_EXCLUSION_SELECTOR).forEach((element) => element.remove());
  formatCopiedPostHeaders(copyRoot);
  const text = copiedPostPlainText(copyRoot);
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    setFooterError(`投稿をコピーできませんでした: ${String(error)}`);
  }
}

function handlePostContentCopy(event: ClipboardEvent): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !event.clipboardData) return;

  const range = selection.getRangeAt(0);
  if (!range.intersectsNode(postsElement) && !range.intersectsNode(bbsActionViewContent)) return;

  const fragment = range.cloneContents();
  fragment.querySelectorAll(POST_COPY_EXCLUSION_SELECTOR).forEach((element) => element.remove());
  formatCopiedPostHeaders(fragment);
  const container = document.createElement('div');
  container.append(fragment);
  const text = copiedPostPlainText(container);
  event.clipboardData.setData('text/plain', text);
  event.clipboardData.setData('text/html', container.innerHTML);
  event.preventDefault();
}

postsElement.addEventListener('click', handlePostContentClick);
postsElement.addEventListener('contextmenu', openPostContextMenu);
postsElement.addEventListener('mouseover', handleImageThumbnailMouseOver);
postsElement.addEventListener('mouseout', handleImageThumbnailMouseOut);
bbsActionViewContent.addEventListener('click', handlePostContentClick);
bbsActionViewContent.addEventListener('contextmenu', openPostContextMenu);
bbsActionViewContent.addEventListener('mouseover', handleImageThumbnailMouseOver);
bbsActionViewContent.addEventListener('mouseout', handleImageThumbnailMouseOut);
document.addEventListener('copy', handlePostContentCopy);
bbsActionViewCloseButton.addEventListener('click', closeBbsActionView);
bbsActionView.addEventListener('click', (event) => {
  if (event.target === bbsActionView) closeBbsActionView();
});
bbsActionViewShell.addEventListener('click', (event) => event.stopPropagation());
savedPostsViewCloseButton.addEventListener('click', closeSavedPostsView);
savedPostsView.addEventListener('click', (event) => {
  if (event.target === savedPostsView) closeSavedPostsView();
});
savedPostsViewContent.addEventListener('click', handlePostContentClick);
savedPostsViewContent.addEventListener('contextmenu', openPostContextMenu);
document.addEventListener('click', (event) => {
  if (event.target instanceof Node && !postContextMenu.contains(event.target)) closePostContextMenu();
});
postContextMenu.addEventListener('keydown', (event) => {
  const items = Array.from(postContextMenu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  if (event.key === 'Escape') {
    event.preventDefault();
    closePostContextMenu();
    return;
  }
  if (items.length === 0) return;
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    items[event.key === 'Home' ? 0 : items.length - 1].focus();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
  const nextIndex = nextPostContextMenuIndex(currentIndex, event.key === 'ArrowDown' ? 1 : -1, items.length);
  items[nextIndex].focus();
});
shortcutKeyListViewCloseButton.addEventListener('click', () => closeShortcutKeyListView());
shortcutKeyListView.addEventListener('click', (event) => {
  if (event.target === shortcutKeyListView) closeShortcutKeyListView();
});
shortcutKeyListDescriptionLink.addEventListener('click', (event) => {
  event.preventDefault();
  openShortcutKeyListFromSettings();
});

textSearchInput.addEventListener('input', () => {
  refreshTextSearch(true, true);
});

textSearchRegexInput.addEventListener('change', () => {
  refreshTextSearch(true, true);
  textSearchInput.focus();
});

textSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    moveTextSearch(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeTextSearch();
  }
});

textSearchPrevButton.addEventListener('click', () => {
  moveTextSearch(-1);
});

textSearchNextButton.addEventListener('click', () => {
  moveTextSearch(1);
});

textSearchCloseButton.addEventListener('click', () => {
  closeTextSearch();
});

newPostButton.addEventListener('click', () => {
  openNewPostView();
});

savedPostsButton.addEventListener('click', openSavedPostsView);

shortcutKeyListButton.addEventListener('click', openShortcutKeyListView);

reloadButton.addEventListener('click', () => {
  void runFetchCycle(false);
});

unreadJumpButton.addEventListener('click', () => {
  jumpToUnreadBoundary();
});

timelineUnreadJumpButton.addEventListener('click', () => {
  jumpToUnreadBoundary();
});

settingsButton.addEventListener('click', () => {
  openSettings();
});

settingsCloseButton.addEventListener('click', () => {
  closeSettingsDialog();
});

settingsDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeSettingsDialog();
});

settingsTabGeneralButton.addEventListener('click', () => {
  switchSettingsTab('general');
});

settingsTabBbsButton.addEventListener('click', () => {
  switchSettingsTab('bbs');
});

settingsTabConfigFileButton.addEventListener('click', () => {
  switchSettingsTab('config-file');
});

settingsTabResetButton.addEventListener('click', () => {
  switchSettingsTab('reset');
});

settingsTabVersionButton.addEventListener('click', () => {
  switchSettingsTab('version');
});

checkAppUpdateButton.addEventListener('click', () => {
  void checkForManualUpdate();
});

installAppUpdateButton.addEventListener('click', () => {
  void installManualUpdate();
});

resetReplyNotificationList.addEventListener('change', () => {
  resetRemoveReplyNotificationsButton.disabled = selectedResetItems(resetReplyNotificationList).length === 0;
});

resetHiddenThreadList.addEventListener('change', () => {
  resetRemoveHiddenThreadsButton.disabled = selectedResetItems(resetHiddenThreadList).length === 0;
});

resetRemoveReplyNotificationsButton.addEventListener('click', () => {
  void removeSelectedReplyNotifications();
});

resetRemoveHiddenThreadsButton.addEventListener('click', () => {
  void removeSelectedHiddenThreads();
});

resetGeneralSettingsButton.addEventListener('click', () => {
  void resetConfigToBundled('global.toml');
});

resetBbsSettingsButton.addEventListener('click', () => {
  void resetConfigToBundled('bbs.toml');
});

resetUnreadStateButton.addEventListener('click', () => {
  resetUnreadState();
});

resetPostLogButton.addEventListener('click', () => {
  resetPostLog();
});

generalSettingsCloseButton.addEventListener('click', () => {
  closeSettingsDialog();
});

generalReplyNotificationChooseSoundButton.addEventListener('click', () => {
  void chooseReplyNotificationSound();
});

generalReplyNotificationResetSoundButton.addEventListener('click', () => {
  resetReplyNotificationSoundToDefault();
});

generalExportConfigButton.addEventListener('click', () => {
  void exportSettingsFile('global.toml');
});

generalImportConfigButton.addEventListener('click', () => {
  void importSettingsFile('global.toml');
});

for (const pair of [...postColorInputs.values(), ...advancedPostColorInputs.values(), ...treeColorInputs.values()]) {
  pair.picker.addEventListener('input', () => {
    pair.text.value = pair.picker.value.toLowerCase();
  });
  pair.text.addEventListener('input', () => {
    const value = pair.text.value.trim();
    if (HEX_COLOR_RE.test(value)) pair.picker.value = value;
  });
}

generalHighlightTextColorPicker.addEventListener('input', () => {
  generalHighlightTextColorInput.value = generalHighlightTextColorPicker.value.toLowerCase();
});
generalHighlightTextColorInput.addEventListener('input', () => {
  const value = generalHighlightTextColorInput.value.trim();
  if (HEX_COLOR_RE.test(value)) generalHighlightTextColorPicker.value = value;
});
generalHighlightBackgroundColorPicker.addEventListener('input', () => {
  generalHighlightBackgroundColorInput.value = generalHighlightBackgroundColorPicker.value.toLowerCase();
});
generalHighlightBackgroundColorInput.addEventListener('input', () => {
  const value = generalHighlightBackgroundColorInput.value.trim();
  if (HEX_COLOR_RE.test(value)) generalHighlightBackgroundColorPicker.value = value;
});
generalCurrentPostBorderColorPicker.addEventListener('input', () => {
  generalCurrentPostBorderColorInput.value = generalCurrentPostBorderColorPicker.value.toLowerCase();
});
generalCurrentPostBorderColorInput.addEventListener('input', () => {
  const value = generalCurrentPostBorderColorInput.value.trim();
  if (HEX_COLOR_RE.test(value)) generalCurrentPostBorderColorPicker.value = value;
});

generalSettingsDialog.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest('.post-preview-link')) event.preventDefault();
});

generalSettingsForm.addEventListener('input', () => {
  commitGeneralSettingsForm();
  previewGeneralStyleSettings();
  updatePollIntervalWarning();
  setGeneralSettingsDirty(true);
  showGeneralSettingsMessage('');
});

generalSettingsForm.addEventListener('change', () => {
  commitGeneralSettingsForm();
  previewGeneralStyleSettings();
  updatePollIntervalWarning();
  setGeneralSettingsDirty(true);
  showGeneralSettingsMessage('');
});

generalDiscardButton.addEventListener('click', () => {
  discardGeneralSettings();
});

generalSettingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveGeneralSettings();
});

bbsSettingsCloseButton.addEventListener('click', () => {
  closeSettingsDialog();
});

bbsSettingsList.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const item = target.closest<HTMLElement>('[data-index]');
  if (!item) return;
  const index = Number.parseInt(item.dataset.index ?? '', 10);
  if (!Number.isFinite(index) || index === selectedBbsIndex) return;
  selectBbsEditor(index);
});

bbsAddButton.addEventListener('click', () => {
  addBbsEditor();
});

bbsDeleteButton.addEventListener('click', () => {
  deleteSelectedBbs();
});

bbsDiscardButton.addEventListener('click', () => {
  discardBbsSettings();
});

bbsExportConfigButton.addEventListener('click', () => {
  void exportSettingsFile('bbs.toml');
});

bbsImportConfigButton.addEventListener('click', () => {
  void importSettingsFile('bbs.toml');
});

for (const [picker, text] of [
  [bbsBadgeTextColorPicker, bbsBadgeTextColorInput],
  [bbsBadgeBackgroundColorPicker, bbsBadgeBackgroundColorInput],
  [bbsBadgeBorderColorPicker, bbsBadgeBorderColorInput],
] as const) {
  picker.addEventListener('input', () => {
    text.value = picker.value.toLowerCase();
    updateBbsBadgePreview();
  });
  text.addEventListener('input', () => {
    const value = text.value.trim();
    if (HEX_COLOR_RE.test(value)) picker.value = value;
    updateBbsBadgePreview();
  });
}

bbsSettingsForm.addEventListener('input', () => {
  commitBbsEditorForm();
  setBbsSettingsDirty(true);
  renderBbsSettingsList();
  updateParserModeFields();
  updateTimezoneCustomField();
  updateBbsBadgePreview();
});

bbsSettingsForm.addEventListener('change', () => {
  commitBbsEditorForm();
  setBbsSettingsDirty(true);
  renderBbsSettingsList();
  updateParserModeFields();
  updateTimezoneCustomField();
  updateBbsBadgePreview();
});

bbsUrlInput.addEventListener('blur', () => {
  if (!bbsRefererInput.value.trim() && bbsUrlInput.value.trim()) {
    bbsRefererInput.value = bbsUrlInput.value.trim();
    commitBbsEditorForm();
    setBbsSettingsDirty(true);
  }
});

bbsSettingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveBbsSettings();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !postContextMenu.hidden) {
    event.preventDefault();
    closePostContextMenu();
    return;
  }
  if (isTextSearchShortcut(event) && shortcutKeyListView.hidden) {
    event.preventDefault();
    openTextSearch();
    return;
  }

  if (shouldHandleBbsTimelineShortcut(event) && selectBbsTimelineForShortcut(event.key)) {
    event.preventDefault();
    return;
  }

  if (shouldHandleModifiedNavigationShortcut(event)) {
    const key = event.key.toLowerCase();
    event.preventDefault();
    if (key === 't') {
      openCurrentPostAction('tree');
      return;
    }
    if (key === 'r') {
      reloadButton.click();
      return;
    }
    if (key === 'b') {
      toggleTimelineNavigation();
      return;
    }
  }

  if (shouldHandleSavedPostNavigationShortcut(event)) {
    const key = event.key.toLowerCase();
    if (key === 'j') {
      event.preventDefault();
      moveCurrentPost(1);
      return;
    }
    if (key === 'k') {
      event.preventDefault();
      moveCurrentPost(-1);
      return;
    }
    if (key === 'd') {
      event.preventDefault();
      deleteCurrentSavedPost();
      return;
    }
  }

  if (shouldHandlePostNavigationShortcut(event)) {
    const key = event.key.toLowerCase();
    if (key === 'j') {
      event.preventDefault();
      moveCurrentPost(1);
      return;
    }
    if (key === 'k') {
      event.preventDefault();
      moveCurrentPost(-1);
      return;
    }
    if (key === 'r') {
      event.preventDefault();
      openCurrentPostFollow();
      return;
    }
    if (key === 'd') {
      event.preventDefault();
      toggleCurrentPostSaved();
      return;
    }
    if (key === '.') {
      event.preventDefault();
      jumpToUnreadBoundaryFromShortcut();
      return;
    }
    if (key === 'g') {
      event.preventDefault();
      jumpToNewestPost();
      return;
    }
    if (key === 'n') {
      event.preventDefault();
      openNewPostView();
      return;
    }
    if (key === 't') {
      event.preventDefault();
      openCurrentPostAction('thread');
      return;
    }
  }

  if (event.key === 'Escape' && !bbsActionView.hidden) {
    event.preventDefault();
    closeBbsActionView();
    return;
  }

  if (event.key === 'Escape' && !savedPostsView.hidden) {
    event.preventDefault();
    closeSavedPostsView();
    return;
  }

  if (event.key === 'Escape' && !shortcutKeyListView.hidden) {
    event.preventDefault();
    closeShortcutKeyListView();
    return;
  }

  if (event.key === 'Escape' && !textSearchBar.hidden && document.activeElement !== textSearchInput) {
    event.preventDefault();
    closeTextSearch();
  }
});

window.addEventListener('scroll', handleReadOnTopScroll, { passive: true });

void bootstrap();
