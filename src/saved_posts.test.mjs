import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const savedPosts = await import('./saved_posts.ts').catch(() => null);

function post(id) {
  return {
    id,
    site_id: 'misao',
    title: '題名',
    name: '名無し',
    email: '',
    posted_at_raw: '2026/08/26(水)12時00分00秒',
    posted_at: '2026-08-26T12:00:00Z',
    follow_url: null,
    thread_url: null,
    parent_id: null,
    thread_id: null,
    body_html: '本文',
    body_text: '本文',
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('保存は投稿ごとに一件だけ保持し、再保存時に保存日時を更新する', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const storage = memoryStorage();

  savedPosts.savePost(storage, 'saved-posts', post('100'), '2026-08-26T10:00:00Z');
  const entries = savedPosts.savePost(storage, 'saved-posts', post('100'), '2026-08-26T12:00:00Z');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].saved_at, '2026-08-26T12:00:00Z');
});

test('ツリー内の投稿をまとめて保存し、既存の保存済み投稿と重複しない', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const storage = memoryStorage();
  savedPosts.savePost(storage, 'saved-posts', post('already'), '2026-08-26T09:00:00Z');

  const entries = savedPosts.savePosts(
    storage,
    'saved-posts',
    [post('one'), post('two'), post('one')],
    '2026-08-26T12:00:00Z',
  );

  assert.deepEqual(entries.map((entry) => entry.id).sort(), ['already', 'one', 'two']);
  assert.deepEqual(
    entries.filter((entry) => entry.id !== 'already').map((entry) => entry.saved_at),
    ['2026-08-26T12:00:00Z', '2026-08-26T12:00:00Z'],
  );
});

test('ツリー保存した投稿は復元後も同じツリー識別子を持つ', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const storage = memoryStorage();

  savedPosts.saveTreePosts(
    storage,
    'saved-posts',
    [post('one'), post('two')],
    'misao:thread-100',
    '2026-08-26T12:00:00Z',
  );

  const entries = savedPosts.parseSavedPosts(storage.getItem('saved-posts'));
  assert.deepEqual(entries.map((entry) => entry.saved_tree_key), ['misao:thread-100', 'misao:thread-100']);
});

test('ツリー保存由来の投稿だけを保存済みツリーとしてまとめる', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const entries = [
    { ...post('one'), saved_at: '2026-08-26T12:00:00Z', saved_tree_key: 'misao:thread-100' },
    { ...post('two'), saved_at: '2026-08-26T12:00:00Z', saved_tree_key: 'misao:thread-100' },
    { ...post('individual'), saved_at: '2026-08-26T12:00:00Z' },
  ];

  assert.deepEqual(
    savedPosts.savedTreeGroups(entries).map((group) => group.map((entry) => entry.id)),
    [['one', 'two']],
  );
});

test('保存済み投稿は保存日時の新しい順で復元できる', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');

  const entries = savedPosts.parseSavedPosts(JSON.stringify([
    { ...post('old'), saved_at: '2026-08-26T10:00:00Z' },
    { ...post('new'), saved_at: '2026-08-26T12:00:00Z' },
  ]));

  assert.deepEqual(entries.map((entry) => entry.id), ['new', 'old']);
});

test('保存済み投稿は投稿単位で削除できる', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const storage = memoryStorage();
  storage.setItem('saved-posts', JSON.stringify([
    { ...post('keep'), saved_at: '2026-08-26T12:00:00Z' },
    { ...post('delete'), saved_at: '2026-08-26T11:00:00Z' },
  ]));

  const entries = savedPosts.removeSavedPost(storage, 'saved-posts', 'misao', 'delete');

  assert.deepEqual(entries.map((entry) => entry.id), ['keep']);
});

test('保存済み投稿の保存日時と削除ボタンは◆と同じメタ行に置く', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const renderSavedPosts = main.match(/function renderSavedPosts\(\): void \{([\s\S]*?)\n\}/u)?.[1] ?? '';

  assert.match(renderSavedPosts, /primary\?\.append\(savedMeta\)/u);
  assert.doesNotMatch(renderSavedPosts, /meta\?\.append\(secondary\)/u);
});

test('保存済み投稿のツリーには上下の区切り線を表示する', async () => {
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(
    style,
    /\.saved-posts-view \.tree-thread-group\s*\{[^}]*border-top:\s*1px solid var\(--post-border-color\);[^}]*border-bottom:\s*1px solid var\(--post-border-color\)/u,
  );
});

test('投稿の保存済み状態は掲示板IDと投稿IDの組み合わせで判定する', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const entries = [{ ...post('100'), saved_at: '2026-08-26T12:00:00Z' }];

  assert.equal(savedPosts.hasSavedPost(entries, 'misao', '100'), true);
  assert.equal(savedPosts.hasSavedPost(entries, 'other', '100'), false);
  assert.equal(savedPosts.hasSavedPost(entries, 'misao', '101'), false);
});

test('ツリーの全投稿が保存済みのときだけ一括解除状態になる', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const entries = [
    { ...post('one'), saved_at: '2026-08-26T12:00:00Z' },
    { ...post('two'), saved_at: '2026-08-26T12:00:00Z' },
  ];

  assert.equal(savedPosts.arePostsSaved(entries, [post('one'), post('two')]), true);
  assert.equal(savedPosts.arePostsSaved(entries, [post('one'), post('three')]), false);
});

test('ツリー内の投稿をまとめて保存解除し、ほかの保存済み投稿は残す', () => {
  assert.ok(savedPosts, '保存済み投稿モジュールが必要です');
  const storage = memoryStorage();
  storage.setItem('saved-posts', JSON.stringify([
    { ...post('one'), saved_at: '2026-08-26T12:00:00Z' },
    { ...post('two'), saved_at: '2026-08-26T12:00:00Z' },
    { ...post('outside'), saved_at: '2026-08-26T12:00:00Z' },
  ]));

  const entries = savedPosts.removePosts(storage, 'saved-posts', [post('one'), post('two')]);

  assert.deepEqual(entries.map((entry) => entry.id), ['outside']);
});

test('保存操作ボタンは投稿メタ情報の右端へ寄せる', async () => {
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(style, /\.post-date-actions\s*\{[^}]*flex:\s*1 1 auto/u);
  assert.match(style, /\.post-save-button\s*\{[^}]*margin-left:\s*auto/u);
  assert.match(style, /\.saved-post-meta\s*\{[^}]*margin-left:\s*auto/u);
});

test('保存ボタンはハートアイコン画像と保存済み状態の色を使う', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(main, /save-heart-filled\.png/u);
  assert.match(main, /className = `save-icon is-\$\{saved \? 'saved' : 'unsaved'\}`/u);
  assert.match(style, /\.post-save-button\.is-saved\s*\{[^}]*color:/u);
});

test('通知ボタンと保存ボタンは枠線を表示しない', async () => {
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(style, /\.post-notification-button,\s*\.post-save-button\s*\{[^}]*border:\s*0/u);
});

test('保存前後でハートPNGアイコンを切り替える', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /save-heart-outline\.png/u);
  assert.match(main, /save-heart-filled\.png/u);
  assert.match(main, /saved \? SAVE_ICON_FILLED_URL : SAVE_ICON_OUTLINE_URL/u);
});

test('通常タイムラインでは保存ボタンをBBSバッジの後に配置する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const renderPosts = main.match(/function renderPosts\(\): void \{([\s\S]*?)\n\}/u)?.[1] ?? '';

  assert.match(renderPosts, /primaryMeta\.append\(buildPostDateActions\(post, false\)\);[\s\S]*primaryMeta\.append\(site\);[\s\S]*createSavePostButton\(post\)/u);
});

test('通常タイムラインでは通知ボタンを保存ボタンの直前に配置する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const renderPosts = main.match(/function renderPosts\(\): void \{([\s\S]*?)\n\}/u)?.[1] ?? '';

  assert.match(renderPosts, /createReplyNotificationButton\(post\)[\s\S]*createSavePostButton\(post\)/u);
});

test('キーボード操作が有効なときdキーで現在の投稿の保存状態を切り替える', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /function toggleCurrentPostSaved\(\): void/u);
  assert.match(main, /if \(key === 'd'\) \{[\s\S]*toggleCurrentPostSaved\(\)/u);
});

test('保存済み投稿一覧ではj・kで投稿を移動しdで選択中の投稿を削除できる', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /function shouldHandleSavedPostNavigationShortcut\(event: KeyboardEvent\): boolean/u);
  assert.match(main, /if \(key === 'j'\) \{[\s\S]*moveCurrentPost\(1\)/u);
  assert.match(main, /if \(key === 'k'\) \{[\s\S]*moveCurrentPost\(-1\)/u);
  assert.match(main, /if \(key === 'd'\) \{[\s\S]*deleteCurrentSavedPost\(\)/u);
});
