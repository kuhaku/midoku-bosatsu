import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('一般設定のツリー項目をツリー表示セクションにまとめる', () => {
  const treeSection = mainSource.match(/<details class="settings-section(?: [^"]+)?">\s*<summary class="settings-section-heading">[\s\S]*?<h3>ツリー表示<\/h3>[\s\S]*?<\/details>/u)?.[0];

  assert.ok(treeSection, 'ツリー表示セクションが見つかりません');
  assert.match(treeSection, /<h3>ツリー表示<\/h3>/u);
  assert.match(treeSection, /general-tree-view-enabled/u);
  assert.match(treeSection, /tree-color-fields/u);

  const treeColorFields = mainSource.match(/const TREE_COLOR_FIELDS[\s\S]*?\];/u)?.[0];
  assert.ok(treeColorFields, 'ツリー色フィールド定義が見つかりません');
  assert.match(treeColorFields, /ツリーヘッダーの背景色/u);
  assert.match(treeColorFields, /ツリー表示時の既読投稿の文字色/u);

  const timelineSection = mainSource.match(/<h3>基本的な設定<\/h3>[\s\S]*?<\/details>/u)?.[0];
  assert.ok(timelineSection, '投稿表示セクションが見つかりません');
  assert.doesNotMatch(timelineSection, /general-tree-view-enabled/u);
  assert.match(mainSource, /general-hide-tree-link/u);
  assert.match(mainSource, /general-hide-thread-hide-link/u);
  assert.match(mainSource, /「木」を表示する/u);
  assert.match(mainSource, /「消」を表示する/u);
  assert.ok(
    mainSource.indexOf('id="general-max-posts"') < mainSource.indexOf('id="general-hide-tree-link"'),
    '木設定は投稿表示上限数の後に配置してください',
  );
  assert.ok(
    mainSource.indexOf('id="general-hide-tree-link"') < mainSource.indexOf('id="general-hide-thread-hide-link"'),
    '消設定は木設定の後に配置してください',
  );

  const postColorsSection = mainSource.match(/<h3>投稿表示の色<\/h3>[\s\S]*?<\/details>/u)?.[0];
  assert.ok(postColorsSection, '投稿表示の色セクションが見つかりません');
  assert.doesNotMatch(postColorsSection, /tree-color-fields/u);

  const postColorFields = mainSource.match(/const POST_COLOR_FIELDS[\s\S]*?\];/u)?.[0];
  assert.ok(postColorFields, '投稿色フィールド定義が見つかりません');
  assert.doesNotMatch(postColorFields, /tree_header_background_color|tree_read_post_text_color/u);
});
