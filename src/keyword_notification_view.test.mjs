import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('./keyword_notification_view.ts', import.meta.url), 'utf8');
test('保存データの読み込み前は通知画面を開かず既存ルールを保護する', () => {
  const code = source.match(/  function open\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(code);
  let opened = 0;
  const context = vm.createContext({
    loaded: false, options: { beforeOpen() { opened++; } },
    root: { hidden: true, setAttribute() {} }, toast: {}, selectedId: null,
    entries: [], updateCounts() {}, renderEditor() {},
  });
  vm.runInContext(code, context);
  context.open();
  assert.equal(opened, 0);
  assert.equal(context.root.hidden, true);
  context.loaded = true;
  context.open();
  assert.equal(opened, 1);
  assert.equal(context.root.hidden, false);
});

test('読み込み完了時にナビを有効化し、破損時もエラーを表示してデータを保持する', () => {
  const body = source.match(/    load\(\) \{([\s\S]*?)\n    \},/)?.[1];
  assert.ok(body);
  for (const fails of [false, true]) {
    const errors = [];
    const context = vm.createContext({
      loaded: false, loadFailed: false, entries: [], migratedHighlights: [], STORAGE_KEY: 'test',
      localStorage: { getItem: () => 'original data' },
      parseKeywordStore(raw) { assert.equal(raw, 'original data'); if (fails) throw Error('broken'); return { entries: ['restored'], migrated_highlights: ['imported'] }; },
      options: { button: { disabled: true }, reportError: e => errors.push(e) }, updateCounts() {},
    });
    vm.runInContext(stripTypeScriptTypes(body), context);
    assert.equal(context.loaded, true);
    assert.equal(context.options.button.disabled, false);
    assert.equal(context.loadFailed, fails);
    assert.equal(errors.length, fails ? 1 : 0);
    if (!fails) assert.deepEqual(context.entries, ['restored']);
  }
});

test('設定からルール管理へ移る際は未保存設定の既存チェックを通す', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const body = main.match(/'#general-keyword-rules-button'\)\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(body);
  for (const dirty of [true, false]) {
    const dialog = { hidden: false };
    let opened = false;
    const run = new Function('closeSettingsDialog', 'hideSettingsDialog', 'settingsDialog', 'keywordNotifications', body);
    run(() => { if (!dirty) dialog.hidden = true; }, () => { dialog.hidden = true; }, dialog, { open() { opened = true; } });
    assert.equal(opened, !dirty);
  }
});
