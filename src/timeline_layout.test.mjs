import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('./style.css', import.meta.url), 'utf8');

test('app-shellの上下余白を縮小し、投稿カードの余白は維持する', () => {
  assert.match(styleSource, /.app-shell\s*\{[^}]*padding:\s*16px 20px calc\(/u);
  assert.match(styleSource, /@media \(max-width: 560px\)\s*\{\s*\.app-shell\s*\{\s*padding:\s*12px 12px calc\(/u);
  assert.match(styleSource, /\.post\s*\{[^}]*padding:\s*17px 20px 20px/u);
});

test('投稿日時は■や◆と同じ投稿フォントサイズを使う', () => {
  assert.match(styleSource, /\.post-time\s*\{[^}]*font-size:\s*var\(--post-font-size\)/u);
});

test('本文の行間を詰める', () => {
  assert.match(styleSource, /\.post-body\s*\{[^}]*line-height:\s*1(?:\.0)?/u);
  assert.match(styleSource, /\.tree-post-display \.post-body\s*\{[^}]*line-height:\s*1(?:\.0)?/u);
});

test('すべて既読ボタンとその参照を削除する', () => {
  assert.doesNotMatch(mainSource, /すべて既読/u);
  assert.doesNotMatch(mainSource, /mark-read-button/u);
  assert.doesNotMatch(mainSource, /markReadButton/u);
});
