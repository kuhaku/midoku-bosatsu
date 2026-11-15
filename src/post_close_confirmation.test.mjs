import test from 'node:test';
import assert from 'node:assert/strict';

const confirmation = await import('./post_close_confirmation.ts').catch(() => null);

test('内容欄に差分がなければ確認ダイアログを出さない', () => {
  assert.ok(confirmation, '投稿画面を閉じる確認の判定モジュールが必要です');

  const shouldConfirm = confirmation.shouldRequestPostCloseConfirmation(true, false);

  assert.equal(shouldConfirm, false);
});

test('内容欄に差分があれば確認ダイアログを出す', () => {
  assert.ok(confirmation, '投稿画面を閉じる確認の判定モジュールが必要です');

  const shouldConfirm = confirmation.shouldRequestPostCloseConfirmation(true, true);

  assert.equal(shouldConfirm, true);
});

test('投稿フォームではない画面は確認ダイアログを出さない', () => {
  assert.ok(confirmation, '投稿画面を閉じる確認の判定モジュールが必要です');

  const shouldConfirm = confirmation.shouldRequestPostCloseConfirmation(false, true);

  assert.equal(shouldConfirm, false);
});

test('取得時の引用を含む本文と比較し、編集を戻すと差分がなくなる', () => {
  assert.equal(typeof confirmation.createPostBodyChangeDetector, 'function');
  const body = { value: '> 引用\n' };
  const changed = confirmation.createPostBodyChangeDetector([body]);
  assert.equal(changed(), false);
  body.value += '返信';
  assert.equal(changed(), true);
  body.value = '> 引用\n';
  assert.equal(changed(), false);
  body.value = '';
  assert.equal(changed(), true);
});

test('空の新規投稿と複数内容欄を取得時の値で比較する', () => {
  assert.equal(typeof confirmation.createPostBodyChangeDetector, 'function');
  const body = { value: '' };
  const second = { value: '初期値' };
  const changed = confirmation.createPostBodyChangeDetector([body, second]);
  assert.equal(changed(), false);
  body.value = ' ';
  assert.equal(changed(), true);
  body.value = '';
  second.value = '';
  assert.equal(changed(), true);
  assert.equal(confirmation.createPostBodyChangeDetector([])(), false);
});

async function closeHarness({ changed = true, confirmed = false } = {}) {
  const { readFileSync } = await import('node:fs');
  const { stripTypeScriptTypes } = await import('node:module');
  const { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const fn = source.match(/(?:async )?function closeBbsActionView\([^]*?\n\}/)[0];
  const form = {};
  let prompts = 0;
  let cleared = 0;
  const context = {
    bbsActionView: { hidden: false, setAttribute() {} },
    bbsActionViewContent: { querySelector: () => form, replaceChildren() { cleared++; } },
    bbsActionViewPosts: [], bbsActionViewIsPostCompose: true,
    postBodyChangeDetectors: new WeakMap([[form, () => changed]]),
    postCloseConfirmationPending: false,
    bbsActionViewRequestSerial: 1,
    shouldRequestPostCloseConfirmation: confirmation.shouldRequestPostCloseConfirmation,
    confirmDialog: async () => { prompts++; return confirmed; },
    clearObservedTwitterCardPreviews() {}, restoreCurrentPostSelection() {},
    setFooterError() {},
  };
  runInNewContext(stripTypeScriptTypes(fn), context);
  return { context, prompts: () => prompts, cleared: () => cleared };
}

test('閉じる確認をキャンセルすると画面と入力を保持する', async () => {
  const h = await closeHarness();
  await h.context.closeBbsActionView();
  assert.equal(h.prompts(), 1);
  assert.equal(h.context.bbsActionView.hidden, false);
  assert.equal(h.cleared(), 0);
});

test('差分ありで承認した場合のみ閉じ、差分なしはそのまま閉じる', async () => {
  for (const changed of [true, false]) {
    const h = await closeHarness({ changed, confirmed: true });
    await h.context.closeBbsActionView();
    assert.equal(h.prompts(), changed ? 1 : 0);
    assert.equal(h.context.bbsActionView.hidden, true);
    assert.equal(h.cleared(), 1);
  }
});

test('投稿成功時は差分があっても確認せず閉じる', async () => {
  const h = await closeHarness();
  await h.context.closeBbsActionView({ submitted: true });
  assert.equal(h.prompts(), 0);
  assert.equal(h.context.bbsActionView.hidden, true);
});

test('確認中の連打でダイアログを重複表示せず、画面が切り替わった後は閉じない', async () => {
  const h = await closeHarness();
  let resolve;
  let prompts = 0;
  h.context.confirmDialog = () => { prompts++; return new Promise((done) => { resolve = done; }); };
  const first = h.context.closeBbsActionView();
  await h.context.closeBbsActionView();
  assert.equal(prompts, 1);
  h.context.bbsActionViewRequestSerial++;
  resolve(true);
  await first;
  assert.equal(h.context.bbsActionView.hidden, false);
  assert.equal(h.cleared(), 0);
});

test('確認ダイアログの表示に失敗しても入力内容を破棄しない', async () => {
  const h = await closeHarness();
  h.context.confirmDialog = async () => { throw new Error('dialog failed'); };
  await h.context.closeBbsActionView();
  assert.equal(h.context.bbsActionView.hidden, false);
  assert.equal(h.cleared(), 0);
  assert.equal(h.context.postCloseConfirmationPending, false);
});

test('廃止したEsc確認設定を画面・型・初期設定に残さない', async () => {
  const { readFileSync } = await import('node:fs');
  for (const path of ['./main.ts', '../src-tauri/resources/global.toml']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /confirm_post_close_on_escape|general-confirm-post-close-on-escape|confirmOnEscape/);
  }
});
