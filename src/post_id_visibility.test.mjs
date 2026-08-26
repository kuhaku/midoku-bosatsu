import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('投稿IDの表示要素と表示色設定を持たない', () => {
  const main = read('./main.ts');
  const style = read('./style.css');
  const bundledStyle = read('../src-tauri/resources/reader-style.css');
  const config = read('../src-tauri/src/config.rs');

  assert.doesNotMatch(main, /className = 'post-id'|post_id_color|投稿IDの文字色|--post-id-color/);
  assert.doesNotMatch(style, /post-id|post-id-color/);
  assert.doesNotMatch(bundledStyle, /post-id-color/);
  assert.doesNotMatch(config, /post_id_color|post-id-color|投稿IDの文字色/);
});
