import test from 'node:test';
import assert from 'node:assert/strict';

const bbsTimelineShortcut = await import('./bbs_timeline_shortcut.ts').catch(() => null);

test('Ctrl/Command+Shift+数字の対象はbbs.tomlの登録順で先頭9掲示板までになる', () => {
  assert.ok(bbsTimelineShortcut, 'BBSタイムライン用ショートカット判定モジュールが必要です');

  const sites = [
    { id: 'first' },
    { id: 'second' },
    { id: 'third' },
    { id: 'fourth' },
    { id: 'fifth' },
    { id: 'sixth' },
    { id: 'seventh' },
    { id: 'eighth' },
    { id: 'ninth' },
    { id: 'tenth' },
  ];

  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '1'), 'first');
  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '9'), 'ninth');
  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '0'), null);
  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '10'), undefined);
});

test('選択したBBSの投稿だけをタイムラインに残す', () => {
  assert.ok(bbsTimelineShortcut, 'BBSタイムライン用フィルタが必要です');

  const posts = [
    { site_id: 'first', id: '1' },
    { site_id: 'second', id: '2' },
    { site_id: 'first', id: '3' },
  ];

  assert.deepEqual(
    bbsTimelineShortcut.filterPostsForBbsTimeline(posts, 'first'),
    [{ site_id: 'first', id: '1' }, { site_id: 'first', id: '3' }],
  );
  assert.deepEqual(bbsTimelineShortcut.filterPostsForBbsTimeline(posts, null), posts);
});

const { readFileSync } = await import('node:fs');
const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const predicate = source.match(/function shouldHandleBbsTimelineShortcut\(event: KeyboardEvent\): boolean \{([\s\S]*?)\n\}/u)[1];
const shouldHandle = new Function('event', 'config', 'isEditableKeyboardTarget',
  'settingsDialog', 'savedPostsView', 'shortcutKeyListView', 'textSearchBar', 'bbsActionView', predicate);
const dispatch = source.match(/  if \(shouldHandleBbsTimelineShortcut\(event\)[\s\S]*?\n  \}/u)[0];
const handle = new Function('event', 'shouldHandleBbsTimelineShortcut', 'selectBbsTimelineForShortcut', dispatch);

function press(overrides = {}, { enabled = true, editable = false, hidden = true } = {}) {
  const event = { key: '!', code: 'Digit1', ctrlKey: true, metaKey: false,
    shiftKey: true, altKey: false, ...overrides, preventDefault() {} };
  const view = { hidden };
  let selected;
  handle(event, (event) => shouldHandle(event, { global: { keyboard_shortcuts_enabled: enabled } },
    () => editable, view, view, view, view, view), (key) => { selected = key; return true; });
  return selected;
}

test('Ctrl/Command + Shift + 数字は記号になる数字キーでも正しいBBSを選択する', () => {
  for (const modifier of [{ ctrlKey: true }, { ctrlKey: false, metaKey: true }]) {
    for (let n = 0; n <= 9; n++) {
      assert.equal(press({ ...modifier, code: `Digit${n}`, key: ')!@#$%^&*('[n] }), String(n));
    }
  }
});

test('旧ショートカットや入力中・別画面ではBBSを切り替えない', () => {
  for (const event of [{ shiftKey: false, key: '1' }, { ctrlKey: false },
    { altKey: true }, { code: 'KeyA', key: 'A' }]) {
    assert.equal(press(event), undefined);
  }
  for (const state of [{ enabled: false }, { editable: true }, { hidden: false }]) {
    assert.equal(press({}, state), undefined);
  }
});
