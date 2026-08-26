import test from 'node:test';
import assert from 'node:assert/strict';
import {
  notificationButtonMode,
  notificationButtonViewModel,
  notificationSoundMimeType,
  replyNotificationPostPresentation,
  replyNotificationActions,
  shouldPlayReplyNotification,
  trackingKey,
  knownDescendantPostIds,
  chooseOldestUnreadReplyPostKey,
} from './reply_notification.ts';

test('trackingKey separates site and post id', () => {
  assert.notEqual(trackingKey('ab', 'c'), trackingKey('a', 'bc'));
});

test('automatic tracking has precedence over manual state', () => {
  const state = {
    manual: [{ site_id: 's', post_id: '1' }],
    automatic: [{ site_id: 's', post_id: '1' }],
  };
  assert.equal(notificationButtonMode(state, 's', '1'), 'automatic');
});

test('button view models use requested labels', () => {
  assert.deepEqual(notificationButtonViewModel('off'), { label: '通知', pressed: false, disabled: false });
  assert.deepEqual(notificationButtonViewModel('manual'), { label: '通知中', pressed: true, disabled: false });
  assert.deepEqual(notificationButtonViewModel('automatic'), { label: '自動通知', pressed: true, disabled: true });
});

test('通知ボタンは音声アイコン画像と状態別クラスを使う', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(main, /notification-audio\.png/u);
  assert.match(main, /className = `notification-icon is-\$\{mode\}`/u);
  assert.match(style, /\.post-notification-button\.is-manual[\s\S]*?color:/u);
  assert.match(style, /\.post-notification-button\.is-automatic[\s\S]*?color:/u);
});

test('通知の追跡状態でスピーカーPNGの色を切り替える', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /notification-audio-active\.png/u);
  assert.match(main, /mode === 'off' \? NOTIFICATION_ICON_URL : NOTIFICATION_ICON_ACTIVE_URL/u);
});

test('audio mime types cover supported picker extensions', () => {
  assert.equal(notificationSoundMimeType('notify.ogg'), 'audio/ogg');
  assert.equal(notificationSoundMimeType('tone.mp3'), 'audio/mpeg');
  assert.equal(notificationSoundMimeType('tone.wav'), 'audio/wav');
  assert.equal(notificationSoundMimeType('tone.flac'), 'audio/flac');
  assert.equal(notificationSoundMimeType('tone.m4a'), 'audio/mp4');
  assert.equal(notificationSoundMimeType('tone.bin'), 'application/octet-stream');
});

test('one or more detections still produce one cycle-level decision', () => {
  assert.equal(shouldPlayReplyNotification(false, true, [{ reply_detected: true }]), false);
  assert.equal(shouldPlayReplyNotification(true, false, [{ reply_detected: true }]), false);
  assert.equal(shouldPlayReplyNotification(true, true, [{ reply_detected: false }]), false);
  assert.equal(shouldPlayReplyNotification(true, true, [{ reply_detected: true }]), true);
  assert.equal(shouldPlayReplyNotification(true, true, [{ reply_detected: true }, { reply_detected: true }]), true);
});

test('an enabled cycle with a detected reply triggers only one sound decision', () => {
  assert.deepEqual(
    replyNotificationActions(true, true, [{ reply_detected: true }, { reply_detected: true }]),
    { play_sound: true, reply_post_keys: [] },
  );
  assert.deepEqual(
    replyNotificationActions(false, true, [{ reply_detected: true }]),
    { play_sound: false, reply_post_keys: [] },
  );
  assert.deepEqual(
    replyNotificationActions(true, true, [{ reply_detected: false }]),
    { play_sound: false, reply_post_keys: [] },
  );
});

test('返信通知ONの取得結果には固定バー表示用の対象投稿キーを含める', () => {
  assert.deepEqual(
    replyNotificationActions(true, true, [{
      site_id: 'misao',
      reply_detected: true,
      reply_post_ids: ['101', '102'],
    }]),
    {
      play_sound: true,
      reply_post_keys: ['misao:101', 'misao:102'],
    },
  );
  assert.deepEqual(
    replyNotificationActions(false, true, [{
      site_id: 'misao',
      reply_detected: true,
      reply_post_ids: ['101'],
    }]),
    { play_sound: false, reply_post_keys: [] },
  );
  assert.deepEqual(
    replyNotificationActions(true, false, [{
      site_id: 'misao',
      reply_detected: true,
      reply_post_ids: ['101'],
    }]),
    { play_sound: false, reply_post_keys: ['misao:101'] },
  );
});

test('未読の返信通知対象から投稿日が最も古い投稿キーを選ぶ', () => {
  assert.equal(
    chooseOldestUnreadReplyPostKey([
      { post_key: 's:new', unread: true, timestamp: 300 },
      { post_key: 's:read', unread: false, timestamp: 100 },
      { post_key: 's:old', unread: true, timestamp: 100 },
    ]),
    's:old',
  );
});

test('返信通知対象は未読の間だけ投稿強調とレス通知バッジを表示する', () => {
  assert.deepEqual(
    replyNotificationPostPresentation(true, true),
    { highlighted: true, badge_label: 'レス通知' },
  );
  assert.deepEqual(
    replyNotificationPostPresentation(true, false),
    { highlighted: false, badge_label: null },
  );
  assert.deepEqual(
    replyNotificationPostPresentation(false, true),
    { highlighted: false, badge_label: null },
  );
});

test('通常表示とツリー表示は返信通知対象の見た目を投稿へ適用する', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(main, /function applyReplyNotificationPostPresentation\(/u);
  assert.match(main, /buildTreeNodeArticle\([\s\S]*?applyReplyNotificationPostPresentation\(article, firstLine, post, unread\)/u);
  assert.match(main, /function renderPosts\(\): void \{[\s\S]*?applyReplyNotificationPostPresentation\(article, primaryMeta, post, unread\)/u);
  assert.match(style, /\.post-reply-notification\s*\{[\s\S]*?border:/u);
  assert.match(style, /\.reply-notification-badge\s*\{[\s\S]*?background:/u);
});

test('右下の返信ポップアップは対象返信が未読の間だけ表示する', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(main, /id="reply-notification-popup"/u);
  assert.match(main, />投稿にレスがつきました</u);
  assert.match(main, /function renderReplyNotificationBanner\(\): void \{[\s\S]*?isPostUnread/u);
  assert.match(main, /function renderPosts\(\): void \{[\s\S]*?renderReplyNotificationBanner\(\);/u);
  assert.match(style, /\.reply-notification-popup\s*\{[^}]*position:\s*fixed/u);
  assert.match(style, /\.reply-notification-popup\s*\{[^}]*right:/u);
});

test('右下の返信ポップアップクリックは最古の未読返信へ移動する', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /replyNotificationBannerRow\.addEventListener\('click'/u);
  assert.match(main, /function jumpToOldestUnreadReplyNotification\(\): void \{/u);
  assert.match(main, /replyNotificationPostKeys\.has\(postKey\(post\)\)/u);
  assert.match(main, /chooseOldestUnreadReplyPostKey\([\s\S]*?scrollIntoView/u);
});

test('固定バーには切り分け用の返信通知状態を表示しない', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(main, /id="reply-notification-status"/u);
});

test('一般設定でトースト通知と通知音を別々に設定する', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /レス通知をする（右下トースト通知）/u);
  assert.match(main, /通知音を鳴らす/u);
  assert.match(main, /reply_notification_enabled/u);
});

test('初回取得で検出した返信は既読カーソル初期化後も未読として保持する', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /const forcedUnreadPostKeys = new Set<string>\(\);/u);
  assert.match(main, /function isPostUnread\(post: ParsedPost\): boolean \{\s*if \(forcedUnreadPostKeys\.has\(postKey\(post\)\)\) return true;/u);
  assert.match(main, /function markAllCurrentPostsRead\(\): void \{[\s\S]*?forcedUnreadPostKeys\.clear\(\);/u);
});


test('manual tracking baseline finds existing descendants without depending on post order', () => {
  const ids = knownDescendantPostIds('s', '100', [
    { site_id: 's', id: '103', parent_id: '102', thread_id: '100' },
    { site_id: 's', id: '102', parent_id: '101', thread_id: '100' },
    { site_id: 's', id: '101', parent_id: '100', thread_id: '100' },
    { site_id: 'other', id: '999', parent_id: '100', thread_id: '100' },
  ]);
  assert.deepEqual(new Set(ids), new Set(['101', '102', '103']));
});

test('manual tracking baseline falls back to thread id when explicit parent is unavailable', () => {
  const ids = knownDescendantPostIds('s', '100', [
    { site_id: 's', id: '105', parent_id: '404', thread_id: '100' },
  ]);
  assert.deepEqual(ids, ['105']);
});
