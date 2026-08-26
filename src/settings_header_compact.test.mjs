import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('設定画面上部の補助ラベルと説明を表示しない', () => {
  const headerStart = mainSource.indexOf('<header class="settings-main-header">');
  const headerEnd = mainSource.indexOf('<nav class="settings-tabs"', headerStart);
  const settingsHeader = headerStart >= 0 && headerEnd > headerStart ? mainSource.slice(headerStart, headerEnd) : undefined;

  assert.ok(settingsHeader, '設定画面上部が見つかりません');
  assert.doesNotMatch(settingsHeader, />SETTINGS<\/span>/u);
  assert.doesNotMatch(settingsHeader, /一般設定と取得先BBSの設定をまとめて変更できます。/u);
  assert.match(settingsHeader, /<h2>設定<\/h2>/u);
});
