import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('投稿表示セクションを基本的な設定に改名する', () => {
  const generalSettings = mainSource.match(/<section id="general-settings-dialog"[\s\S]*?<section id="bbs-settings-dialog"/u)?.[0];
  assert.ok(generalSettings, '一般設定の範囲が見つかりません');
  assert.match(generalSettings, /<h3>基本的な設定<\/h3>/u);
  assert.doesNotMatch(generalSettings, /<h3>投稿表示<\/h3>/u);
});
