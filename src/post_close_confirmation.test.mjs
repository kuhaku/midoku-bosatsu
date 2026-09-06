import test from 'node:test';
import assert from 'node:assert/strict';

const confirmation = await import('./post_close_confirmation.ts').catch(() => null);

test('Esc確認がOFFなら確認ダイアログを出さない', () => {
  assert.ok(confirmation, '投稿画面を閉じる確認の判定モジュールが必要です');

  const shouldConfirm = confirmation.shouldRequestPostCloseConfirmation(true, false);

  assert.equal(shouldConfirm, false);
});

test('Esc確認がONなら投稿画面で確認ダイアログを出す', () => {
  assert.ok(confirmation, '投稿画面を閉じる確認の判定モジュールが必要です');

  const shouldConfirm = confirmation.shouldRequestPostCloseConfirmation(true, true);

  assert.equal(shouldConfirm, true);
});

test('投稿フォームではない画面はEsc確認がONでも確認ダイアログを出さない', () => {
  assert.ok(confirmation, '投稿画面を閉じる確認の判定モジュールが必要です');

  const shouldConfirm = confirmation.shouldRequestPostCloseConfirmation(false, true);

  assert.equal(shouldConfirm, false);
});
