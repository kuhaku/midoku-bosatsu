import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const style = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('投稿表示のデスクトップ最大幅は1366pxである', () => {
  assert.match(style, /\.app-shell\s*\{[\s\S]*?width:\s*min\(100%,\s*1366px\)/);
  assert.match(style, /\.fixed-status-inner\s*\{[\s\S]*?width:\s*min\(100%,\s*1366px\)/);
});
