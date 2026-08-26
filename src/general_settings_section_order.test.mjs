import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('一般設定の先頭セクションを投稿表示・画像表示・キーボード操作の順にする', () => {
  const generalSettings = mainSource.match(/<section id="general-settings-dialog"[\s\S]*?<section id="bbs-settings-dialog"/u)?.[0];
  assert.ok(generalSettings, '一般設定の範囲が見つかりません');

  assert.match(generalSettings, /general-timeline-section/u);
  assert.match(generalSettings, /general-image-display-section/u);
  assert.match(generalSettings, /general-keyboard-section/u);

  const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(styleSource, /\.general-settings-content\s*\{[\s\S]*?display:\s*flex/u);
  assert.match(styleSource, /\.general-timeline-section\s*\{[\s\S]*?order:\s*1/u);
  assert.match(styleSource, /\.general-image-display-section\s*\{[\s\S]*?order:\s*2/u);
  assert.match(styleSource, /\.general-keyboard-section\s*\{[\s\S]*?order:\s*3/u);
});
