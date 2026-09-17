import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
function setup() {
  const state = {
    postsByKey: new Map(),
    forcedUnreadPostKeys: new Set(['bbs:2']),
    readCursor: { timestamp: 1000, post_key: 'bbs:0' },
    config: { global: { max_posts: 666 } },
    postKey: (post) => `${post.site_id}:${post.id}`,
    timestampOf: (post) => post.time,
    persistPostLog() { state.saved = JSON.stringify([...state.postsByKey.values()]); },
  };
  state.newestFirstPosts = () => [...state.postsByKey.values()].sort((a, b) => b.time - a.time);
  const context = vm.createContext(state);
  for (const name of ['mergePosts', 'isPostUnread']) {
    const fn = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(fn);
    vm.runInContext(stripTypeScriptTypes(fn), context);
  }
  return state;
}
const post = (id, time = 2000) => ({ id, site_id: 'bbs', time });

test('スレッド取得分を既読で統合し、他の未読投稿と既読位置を維持する', () => {
  const state = setup();
  state.mergePosts([post('1'), post('2')]);
  state.mergePosts([post('2'), post('3')], true);
  assert.equal(state.postsByKey.size, 3);
  assert.equal(state.isPostUnread(state.postsByKey.get('bbs:1')), true);
  assert.equal(state.isPostUnread(state.postsByKey.get('bbs:2')), false);
  assert.equal(state.isPostUnread(state.postsByKey.get('bbs:3')), false);
  assert.equal(state.readCursor.timestamp, 1000);
});

test('通常取得で重複しても、ログを復元しても、取得済みスレッド投稿は既読のまま', () => {
  const state = setup();
  state.mergePosts([post('3')], true);
  state.mergePosts([post('3'), post('4')]);
  const restored = setup();
  restored.mergePosts(JSON.parse(state.saved));
  assert.equal(restored.isPostUnread(restored.postsByKey.get('bbs:3')), false);
  assert.equal(restored.isPostUnread(restored.postsByKey.get('bbs:4')), true);
});

test('スレッド取得にも投稿上限を適用する', () => {
  const state = setup();
  state.config.global.max_posts = 2;
  state.mergePosts([post('1', 1100), post('2', 2200)]);
  state.mergePosts([post('3', 3300)], true);
  assert.deepEqual([...state.postsByKey.keys()], ['bbs:2', 'bbs:3']);
});

for (const kind of ['thread', 'tree', 'follow']) {
  test(`${kind} の取得結果を表示し、thread/tree だけタイムラインに既読で追加する`, async () => {
    const state = setup();
    const element = () => ({ hidden: false, setAttribute() {}, replaceChildren() {}, append() {}, focus() {} });
    Object.assign(state, {
      bbsActionViewRequestSerial: 0,
      closeSavedPostsView() {}, closeShortcutKeyListView() {},
      bbsActionView: element(), bbsActionViewSite: element(),
      bbsActionViewTitle: element(), bbsActionViewContent: element(),
      bbsActionViewCloseButton: element(), siteNames: new Map(),
      clearObservedTwitterCardPreviews() {}, document: { createElement: element },
      invoke: async () => ({ posts: [post('3')] }),
      renderPosts() { state.rendered = [...state.postsByKey.values()]; },
      renderBbsActionViewResult(result) { state.displayed = result.posts; },
    });
    const fn = source.match(/async function openBbsActionView\([\s\S]*?\n\}/)?.[0];
    vm.runInContext(stripTypeScriptTypes(fn), vm.createContext(state));
    await state.openBbsActionView('bbs', 'https://example.com/thread', kind);
    assert.equal(state.displayed.length, 1);
    assert.equal(state.postsByKey.size, kind === 'follow' ? 0 : 1);
    if (kind !== 'follow') {
      assert.equal(state.isPostUnread(state.rendered[0]), false);
      assert.equal(state.isPostUnread(state.displayed[0]), false);
    }
  });
}

test('追加した投稿はタイムラインのツリーにも親子関係と既読状態を保って反映される', async () => {
  const state = setup();
  const { buildTreeNodePrefixes } = await import('./tree_layout.ts');
  state.buildTreeNodePrefixes = buildTreeNodePrefixes;
  state.compareNewestFirst = (a, b) => b.time - a.time;
  const start = source.indexOf('function compareOldestFirst(');
  const end = source.indexOf('function createTreeActionLink(', start);
  vm.runInContext(stripTypeScriptTypes(source.slice(start, end)), vm.createContext(state));
  state.mergePosts([{ ...post('1', 1100), thread_id: '1', parent_id: null }]);
  state.mergePosts([
    { ...post('2', 2200), thread_id: '1', parent_id: '1' },
    { ...post('3', 3300), thread_id: '1', parent_id: '2' },
  ], true);
  const groups = state.buildTreeDisplayGroups([...state.postsByKey.values()]);
  assert.equal(groups.length, 1);
  assert.deepEqual(Array.from(groups[0].items, ({ post, depth }) =>
    [post.id, depth, state.isPostUnread(post)]), [
    ['1', 0, true], ['2', 1, false], ['3', 2, false],
  ]);
});
