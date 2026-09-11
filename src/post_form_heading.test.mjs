import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('投稿フォームに専用見出しを表示しない', () => {
  assert.doesNotMatch(mainSource, /bbs-follow-post-form-heading/u);
  assert.doesNotMatch(styleSource, /bbs-follow-post-form-heading/u);
});
