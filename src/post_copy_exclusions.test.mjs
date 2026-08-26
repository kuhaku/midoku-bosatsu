import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('./style.css', import.meta.url), 'utf8');

test('コピー時に装飾UIと木リンクの直前の空白を選択しない', () => {
  assert.match(mainSource, /function appendPostActionLinks[\s\S]*?treeCopyExclusion\.append\(document\.createTextNode\('　'\), tree\)/u);
  assert.match(styleSource, /\.post-copy-exclusion[\s\S]*?user-select:\s*none/u);
  assert.match(styleSource, /\.site-badge,[\s\S]*?\.unread-badge,[\s\S]*?\.post-notification-button,[\s\S]*?\.post-save-button[\s\S]*?user-select:\s*none/u);
});

test('コピー時は選択範囲を複製して投稿UIをクリップボードから除外する', () => {
  assert.match(mainSource, /const POST_COPY_EXCLUSION_SELECTOR = '\.post-copy-exclusion, \.site-badge, \.unread-badge, \.post-notification-button, \.post-save-button';/u);
  assert.match(mainSource, /function handlePostContentCopy\(event: ClipboardEvent\): void \{[\s\S]*?const fragment = range\.cloneContents\(\);[\s\S]*?fragment\.querySelectorAll\(POST_COPY_EXCLUSION_SELECTOR\)\.forEach\(\(element\) => element\.remove\(\)\);[\s\S]*?event\.clipboardData\.setData\('text\/plain', text\);[\s\S]*?event\.preventDefault\(\);/u);
  assert.match(mainSource, /document\.addEventListener\('copy', handlePostContentCopy\);/u);
  assert.match(mainSource, /range\.intersectsNode\(postsElement\)[\s\S]*?range\.intersectsNode\(bbsActionViewContent\)/u);
  assert.match(mainSource, /fragment\.querySelectorAll\(POST_COPY_EXCLUSION_SELECTOR\)[\s\S]*?formatCopiedPostHeaders\(fragment\);/u);
});

test('コピーした1行目の親子ブロックによる重複改行を出力しない', () => {
  assert.match(mainSource, /const nextSibling = node\.nextSibling;[\s\S]*?if \(!\(nextSibling instanceof HTMLElement && blockElements\.has\(nextSibling\.tagName\)\)\) parts\.push\('\\n'\);/u);
});

test('ツリーの投稿日行と本文の間はコピー時に改行する', () => {
  assert.match(mainSource, /node\.classList\.contains\('tree-post-first-line'\)[\s\S]*?parts\.push\('\\n'\)/u);
});

test('ツリー投稿間のコピー出力には空行を入れない', () => {
  assert.match(mainSource, /root\.querySelector\('\.post-tree-node'\)[\s\S]*?replace\(\/\\n\{2,\}\/gu, '\\n'\)/u);
});

test('ツリーヘッダーと親投稿の間はコピー時に改行する', () => {
  assert.match(mainSource, /node\.classList\.contains\('tree-thread-header'\)[\s\S]*?parts\.push\('\\n'\)/u);
});
