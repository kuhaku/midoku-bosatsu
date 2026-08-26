import test from 'node:test';
import assert from 'node:assert/strict';

const contextMenu = await import('./post_context_menu.ts').catch(() => null);

test('右クリックメニューはコピーを先頭に置き、投稿で利用可能な操作と有効な任意機能だけを表示する', () => {
  assert.ok(contextMenu, '右クリックメニューモジュールが必要です');

  assert.deepEqual(
    contextMenu.postContextMenuEntries({
      has_follow_url: true,
      has_thread_url: true,
      thread_hiding_enabled: false,
      reply_notification_enabled: false,
      post_saving_enabled: false,
    }),
    ['copy', 'separator', 'follow', 'thread', 'tree'],
  );
});

test('右クリックメニューは任意機能の前にだけ2本目の区切りを表示する', () => {
  assert.ok(contextMenu, '右クリックメニューモジュールが必要です');

  assert.deepEqual(
    contextMenu.postContextMenuEntries({
      has_follow_url: true,
      has_thread_url: true,
      thread_hiding_enabled: true,
      reply_notification_enabled: true,
      post_saving_enabled: true,
    }),
    ['copy', 'separator', 'follow', 'thread', 'tree', 'separator', 'hide_thread', 'reply_notification', 'save_post'],
  );
});

test('右クリックメニューは投稿先URLがない操作を表示せず、任意機能の前の区切りは維持する', () => {
  assert.ok(contextMenu, '右クリックメニューモジュールが必要です');

  assert.deepEqual(
    contextMenu.postContextMenuEntries({
      has_follow_url: false,
      has_thread_url: false,
      thread_hiding_enabled: true,
      reply_notification_enabled: true,
      post_saving_enabled: true,
    }),
    ['copy', 'separator', 'reply_notification', 'save_post'],
  );
});

test('右クリックメニューのキーボード移動は先頭と末尾で折り返す', () => {
  assert.ok(contextMenu, '右クリックメニューモジュールが必要です');

  assert.equal(contextMenu.nextPostContextMenuIndex(0, -1, 3), 2);
  assert.equal(contextMenu.nextPostContextMenuIndex(2, 1, 3), 0);
  assert.equal(contextMenu.nextPostContextMenuIndex(1, 1, 3), 2);
});

test('投稿テキスト上の右クリックはWebView標準メニューへ委譲する', () => {
  assert.ok(contextMenu, '右クリックメニューモジュールが必要です');

  assert.equal(contextMenu.shouldOpenPostContextMenu(true), false);
  assert.equal(contextMenu.shouldOpenPostContextMenu(false), true);
  assert.equal(contextMenu.shouldOpenPostContextMenu(false, true), false);
});

test('文字の描画領域外では独自右クリックメニューを開く', () => {
  assert.ok(contextMenu, '右クリックメニューモジュールが必要です');

  const textRect = { left: 20, right: 60, top: 10, bottom: 30 };
  assert.equal(contextMenu.pointerHitsTextRect(40, 20, [textRect]), true);
  assert.equal(contextMenu.pointerHitsTextRect(80, 20, [textRect]), false);
});
