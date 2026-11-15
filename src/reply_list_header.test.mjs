import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('レスの既読ボタンは見出し・閉じると同じヘッダーに配置する', () => {
  const view = source.slice(source.indexOf('<section id="saved-posts-view"'));
  const header = view.slice(0, view.indexOf('</header>'));
  assert.match(header, /id="saved-posts-view-title"/);
  assert.match(header, /id="reply-list-header-actions"/);
  assert.match(header, /id="saved-posts-view-close"/);
  assert.match(source, /replyListHeaderActions\.replaceChildren\(markRepliesReadButton\)/);
  assert.doesNotMatch(source, /fragment\.append\(markRepliesReadButton\)/);
});

test('保存済み投稿表示への切り替え時にレス用の操作を消す', () => {
  const render = source.slice(source.indexOf('function renderSavedPosts(): void'));
  assert.match(render.slice(0, render.indexOf('const fragment')), /replyListHeaderActions\.replaceChildren\(\)/);
});
