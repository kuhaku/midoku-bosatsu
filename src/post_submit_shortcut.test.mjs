import test from 'node:test';
import assert from 'node:assert/strict';

const shortcut = await import('./post_submit_shortcut.ts').catch(() => null);

test('macOSではCommand + Returnだけを投稿ショートカットとして扱う', () => {
  assert.ok(shortcut, '投稿ショートカット判定モジュールが必要です');

  assert.equal(shortcut.isPostSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: true }, 'MacIntel'), true);
  assert.equal(shortcut.isPostSubmitShortcut({ key: 'Enter', ctrlKey: true, metaKey: false }, 'MacIntel'), false);
});

test('macOS以外ではCtrl + Enterだけを投稿ショートカットとして扱う', () => {
  assert.ok(shortcut, '投稿ショートカット判定モジュールが必要です');

  assert.equal(shortcut.isPostSubmitShortcut({ key: 'Enter', ctrlKey: true, metaKey: false }, 'Win32'), true);
  assert.equal(shortcut.isPostSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: true }, 'Win32'), false);
});

test('修飾キーなしのEnterは本文入力の改行として扱う', () => {
  assert.ok(shortcut, '投稿ショートカット判定モジュールが必要です');

  assert.equal(shortcut.isPostSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: false }, 'MacIntel'), false);
  assert.equal(shortcut.isPostSubmitShortcut({ key: 'Enter', ctrlKey: false, metaKey: false }, 'Linux x86_64'), false);
});
