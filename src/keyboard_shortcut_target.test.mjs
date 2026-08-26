import test from 'node:test';
import assert from 'node:assert/strict';

const keyboardShortcutTarget = await import('./keyboard_shortcut_target.ts').catch(() => null);

test('ボタンにフォーカスがあってもタイムラインのショートカットを抑止しない', () => {
  assert.ok(keyboardShortcutTarget, 'タイムライン用ショートカット対象判定モジュールが必要です');

  const button = { closest() { return null; } };

  assert.equal(keyboardShortcutTarget.isPostNavigationShortcutTarget(button), false);
});

test('入力欄にフォーカスがあるとタイムラインのショートカットを抑止する', () => {
  assert.ok(keyboardShortcutTarget, 'タイムライン用ショートカット対象判定モジュールが必要です');

  const input = { closest() { return {}; } };

  assert.equal(keyboardShortcutTarget.isPostNavigationShortcutTarget(input), true);
});
