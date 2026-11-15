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
      initializeKeywordShortcuts: entries => entries,
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

test('数字ショートカットで設定した数字のルールを開く', () => {
  const code = source.match(/  function openForShortcut\(key: string\): boolean \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(code, 'ルール選択用のショートカット処理が必要');
  const context = vm.createContext({
    loaded: true, editorOpen: false, root: { hidden: true }, selectedId: null,
    entries: Array.from({ length: 11 }, (_, i) => ({ rule: { id: `rule-${i + 1}`, shortcut: i === 0 ? '9' : i === 8 ? '1' : i === 9 ? '0' : '' } })),
    opened: 0, open() { this.opened++; },
  });
  // open()の呼び出し回数も実際の処理経由で確認する。
  context.open = () => { context.opened++; };
  vm.runInContext(stripTypeScriptTypes(code), context);
  for (const [key, id] of [['1', 'rule-9'], ['9', 'rule-1'], ['0', 'rule-10']]) {
    assert.equal(context.openForShortcut(key), true);
    assert.equal(context.selectedId, id);
  }
  assert.equal(context.opened, 3);
  for (const key of ['a', '10', '']) assert.equal(context.openForShortcut(key), false);
  context.entries = [];
  assert.equal(context.openForShortcut('1'), false);
  context.entries = [{ rule: { id: 'first' } }];
  context.loaded = false;
  assert.equal(context.openForShortcut('1'), false);
  context.loaded = true;
  context.editorOpen = true;
  context.root.hidden = false;
  assert.equal(context.openForShortcut('1'), false);
  assert.equal(context.opened, 3);
});

test('Ctrl/Command + 数字だけが通知ルールを開き、入力中や別ダイアログでは無効', () => {
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const code = main.match(/function shouldHandleKeywordNotificationShortcut\(event: KeyboardEvent\): boolean \{[\s\S]*?\n\}/)?.[0];
  assert.ok(code, '通知ルール用キー判定が必要');
  const context = vm.createContext({
    config: { global: { keyboard_shortcuts_enabled: true } },
    editable: false, isEditableKeyboardTarget: () => context.editable,
    settingsDialog: { hidden: true }, savedPostsView: { hidden: true },
    shortcutKeyListView: { hidden: true }, textSearchBar: { hidden: true }, bbsActionView: { hidden: true },
  });
  vm.runInContext(stripTypeScriptTypes(code), context);
  const event = { key: '1', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false };
  assert.equal(context.shouldHandleKeywordNotificationShortcut(event), true);
  assert.equal(context.shouldHandleKeywordNotificationShortcut({ ...event, ctrlKey: false, metaKey: true, key: '0' }), true);
  for (const overrides of [{ ctrlKey: false }, { shiftKey: true }, { altKey: true }, { isComposing: true }, { key: 'a' }]) {
    assert.equal(context.shouldHandleKeywordNotificationShortcut({ ...event, ...overrides }), false);
  }
  context.editable = true;
  assert.equal(context.shouldHandleKeywordNotificationShortcut(event), false);
  context.editable = false;
  context.config.global.keyboard_shortcuts_enabled = false;
  assert.equal(context.shouldHandleKeywordNotificationShortcut(event), false);
  context.config.global.keyboard_shortcuts_enabled = true;
  for (const view of ['settingsDialog', 'savedPostsView', 'shortcutKeyListView', 'textSearchBar', 'bbsActionView']) {
    context[view].hidden = false;
    assert.equal(context.shouldHandleKeywordNotificationShortcut(event), false);
    context[view].hidden = true;
  }
  assert.ok(main.indexOf('if (shouldHandleKeywordNotificationShortcut(event)') < main.indexOf('if (keywordNotifications.isOpen() &&'));
});
