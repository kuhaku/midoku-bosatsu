import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const defaultConfigSource = fs.readFileSync(new URL('../src-tauri/resources/global.toml', import.meta.url), 'utf8');
const rustConfigSource = fs.readFileSync(new URL('../src-tauri/src/config.rs', import.meta.url), 'utf8');

test('観賞用自動モードをONにすると設定した秒数ごとに未読投稿を移動する', () => {
  assert.match(mainSource, /const DEFAULT_VIEWING_MODE_INTERVAL_SECONDS = 5;/u);
  assert.match(mainSource, /const MAX_VIEWING_MODE_INTERVAL_SECONDS = 86_400;/u);
  assert.match(mainSource, /function moveToNextUnreadPost[(][)]: void [{]/u);
  assert.match(mainSource, /function startViewingModeTimer[(][)]: void [{][\s\S]*?safeViewingModeIntervalSeconds[(]config[.]global[.]viewing_mode_interval_seconds[)][\s\S]*?setInterval[(]moveToNextUnreadPost, intervalSeconds \* 1000[)]/u);
  assert.match(mainSource, /generalDraftGlobal\.viewing_mode_enabled = generalViewingModeEnabledInput\.checked;/u);
  assert.match(mainSource, /generalDraftGlobal\.viewing_mode_interval_seconds = viewingModeInterval;/u);
  assert.match(mainSource, /function applyDisplayConfig\(globalConfig: GlobalConfig\): void \{[\s\S]*?startViewingModeTimer\(\);/u);
});

test('観賞用自動モード設定は一般設定の一番下にあり、ONのときだけ表示間隔を編集できる', () => {
  const generalSettings = mainSource.match(/<section id="general-settings-dialog"[\s\S]*?<section id="bbs-settings-dialog"/u)?.[0];

  assert.ok(generalSettings, '一般設定の範囲が見つかりません');
  assert.match(generalSettings, /class="settings-section general-viewing-mode-section"/u);
  assert.match(generalSettings, /id="general-viewing-mode-enabled"/u);
  assert.match(generalSettings, /<h3>観賞用自動モード<\/h3>/u);
  assert.match(generalSettings, /id="general-viewing-mode-interval"/u);
  assert.match(mainSource, /function updateViewingModeIntervalVisibility[(][)]: void [{][\s\S]*?generalViewingModeIntervalSettings[.]hidden = !generalViewingModeEnabledInput[.]checked;/u);
  assert.match(mainSource, /function safeViewingModeIntervalSeconds[(]rawSeconds: number[)]: number [{][\s\S]*?rawSeconds > MAX_VIEWING_MODE_INTERVAL_SECONDS[\s\S]*?return DEFAULT_VIEWING_MODE_INTERVAL_SECONDS;/u);
  assert.match(defaultConfigSource, /viewing_mode_enabled = false/u);
  assert.match(defaultConfigSource, /viewing_mode_interval_seconds = 5/u);
  assert.match(rustConfigSource, /pub viewing_mode_enabled: bool,/u);
  assert.match(rustConfigSource, /pub viewing_mode_interval_seconds: u64,/u);
});
