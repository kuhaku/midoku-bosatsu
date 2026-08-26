import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('BBS設定のセクション見出しに英語ラベルを表示しない', () => {
  const bbsSettings = mainSource.match(/<section id="bbs-settings-dialog"[\s\S]*?<section id="config-file-settings-dialog"/u)?.[0];
  assert.ok(bbsSettings, 'BBS設定の範囲が見つかりません');

  assert.doesNotMatch(bbsSettings, /<span class="status-label">(?:BBS SETTINGS|BASIC|BADGE STYLE|POST PARSER|UNREAD RELOAD)<\/span>/gu);
});

test('BBS設定にhidden送信の切り替え項目を表示しない', () => {
  const bbsSettings = mainSource.match(/<section id="bbs-settings-dialog"[\s\S]*?<section id="config-file-settings-dialog"/u)?.[0];
  assert.ok(bbsSettings, 'BBS設定の範囲が見つかりません');

  assert.doesNotMatch(bbsSettings, /bbs-include-hidden|hiddenも送信/u);
});

test('BBS設定のセクションに開閉矢印を表示しない', () => {
  assert.match(styleSource, /\.bbs-settings-editor\s+\.settings-section\s*>\s*\.settings-section-heading::before\s*\{[^}]*content:\s*none;/u);
});
