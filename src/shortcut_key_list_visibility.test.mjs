import test from 'node:test';
import assert from 'node:assert/strict';

const visibility = await import('./shortcut_key_list_visibility.ts').catch(() => null);

test('キーボードショートカットが無効ならキー一覧を左ナビに表示しない', () => {
  assert.ok(visibility, 'キー一覧の表示判定モジュールが必要です');
  assert.equal(visibility.isShortcutKeyListNavigationVisible(false), false);
});

test('キーボードショートカット設定が未指定または有効ならキー一覧を左ナビに表示する', () => {
  assert.ok(visibility, 'キー一覧の表示判定モジュールが必要です');
  assert.equal(visibility.isShortcutKeyListNavigationVisible(undefined), true);
  assert.equal(visibility.isShortcutKeyListNavigationVisible(true), true);
});
