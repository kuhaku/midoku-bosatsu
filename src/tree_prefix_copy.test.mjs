import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const treePrefix = await import('./tree_prefix.ts').catch(() => null);
const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('./style.css', import.meta.url), 'utf8');

test('ツリー本文の各行に使う接頭辞を生成する', () => {
  assert.ok(treePrefix, 'ツリー接頭辞モジュールが必要です');
  assert.equal(treePrefix.buildTreeBodyPrefix(''), '　　');
  assert.equal(treePrefix.buildTreeBodyPrefix('｜'), '　│');
});

test('ツリー本文の縦線はコピー可能な文字列として描画する', () => {
  const treeNodeBuilder = mainSource.match(/function buildTreeNodeArticle[\s\S]*?\n\}\n\nfunction buildTreeGroupElement/u)?.[0];
  assert.ok(treeNodeBuilder, 'ツリー投稿の描画処理が見つかりません');
  assert.match(treeNodeBuilder, /buildTreeBodyPrefix\(bodyPrefix\)/u);
  assert.match(treeNodeBuilder, /body\.prepend\(document\.createTextNode\(prefix\)\)/u);
  assert.match(treeNodeBuilder, /br\.after\(document\.createTextNode\(prefix\)\)/u);
  assert.match(treeNodeBuilder, /contentRow\.append\(display\)/u);
  assert.doesNotMatch(treeNodeBuilder, /contentRow\.append\(prefix, display\)/u);
  assert.doesNotMatch(treeNodeBuilder, /tree-post-content-prefix[\s\S]*?setAttribute\('aria-hidden'/u);

  assert.doesNotMatch(styleSource, /\.tree-post-content-prefix\b/u);
  assert.match(styleSource, /\.tree-post-display \{[\s\S]*?\n\}/u);
  assert.doesNotMatch(styleSource.match(/\.tree-post-display \{[\s\S]*?\n\}/u)?.[0] ?? '', /min-height/u);
  assert.doesNotMatch(styleSource, /\.tree-prefix-char\.is-vertical::before/u);
  assert.doesNotMatch(styleSource, /\.tree-post-content-row-leaf \.tree-post-display[\s\S]*?padding-inline-start/u);
});

test('ツリーヘッダー行末に◆を表示しない', () => {
  const headerBuilder = mainSource.match(/function buildTreeHeader[\s\S]*?\n\}\n\nfunction normalizeTreeHeaderField/u)?.[0];
  assert.ok(headerBuilder, 'ツリーヘッダーの描画処理が見つかりません');
  assert.doesNotMatch(headerBuilder, /記事数：\$\{group\.posts\.length\}　`\)\);/u);
  assert.doesNotMatch(headerBuilder, /header\.append\(createTreeActionLink\(threadSource, 'thread'\)\);[\s\S]*?header\.append\(createTreeActionLink\(threadSource, 'thread'\)\)/u);
});

test('ツリー投稿の未読・レス通知・保存操作を指定順で表示する', () => {
  const treeNodeBuilder = mainSource.match(/function buildTreeNodeArticle[\s\S]*?\n\}\n\nfunction buildTreeGroupElement/u)?.[0];
  assert.ok(treeNodeBuilder, 'ツリー投稿の描画処理が見つかりません');

  const unreadIndex = treeNodeBuilder.indexOf('if (unread) {');
  const notificationIndex = treeNodeBuilder.indexOf('const notificationButton = createReplyNotificationButton(post);');
  const saveIndex = treeNodeBuilder.indexOf('if (config?.global.post_saving_enabled ?? true) {');
  assert.ok(unreadIndex >= 0 && notificationIndex >= 0 && saveIndex >= 0, 'ツリー投稿の操作要素が見つかりません');
  assert.ok(unreadIndex < notificationIndex && notificationIndex < saveIndex, '未読、レス通知、保存の順に表示してください');
});

test('ツリー投稿の未読・レス通知・保存操作をまとめて右寄せする', () => {
  const treeNodeBuilder = mainSource.match(/function buildTreeNodeArticle[\s\S]*?\n\}\n\nfunction buildTreeGroupElement/u)?.[0];
  assert.ok(treeNodeBuilder, 'ツリー投稿の描画処理が見つかりません');
  assert.match(treeNodeBuilder, /actionGroup\.className = 'tree-post-action-group'/u);
  assert.match(treeNodeBuilder, /firstLine\.append\(actionGroup\)/u);

  const actionGroupStyle = styleSource.match(/\.tree-post-action-group\s*\{[\s\S]*?\n\}/u)?.[0] ?? '';
  assert.match(actionGroupStyle, /display:\s*inline-flex/u);
  assert.match(actionGroupStyle, /margin-left:\s*auto/u);
});
