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

test('設定画面のバージョンタブに実行中の未読菩薩のバージョンを表示する', () => {
  const headerStart = mainSource.indexOf('<header class="settings-main-header">');
  const headerEnd = mainSource.indexOf('<nav class="settings-tabs"', headerStart);
  const settingsHeader = headerStart >= 0 && headerEnd > headerStart ? mainSource.slice(headerStart, headerEnd) : undefined;

  assert.match(mainSource, /import \{ getVersion \} from '@tauri-apps\/api\/app';/u);
  assert.match(mainSource, /id="settings-tab-version"[\s\S]*?>バージョン<\/button>/u);
  assert.match(mainSource, /id="version-settings-dialog"[\s\S]*?<h2>未読菩薩<\/h2>[\s\S]*?id="app-version">未読菩薩<\/p>/u);
  assert.doesNotMatch(settingsHeader, /id="app-version"/u);
  assert.match(mainSource, /type SettingsTab = 'general' \| 'bbs' \| 'config-file' \| 'reset' \| 'version';/u);
  assert.match(mainSource, /settingsTabVersionButton\.addEventListener\('click', \(\) => \{[\s\S]*?switchSettingsTab\('version'\);/u);
  assert.match(mainSource, /appVersion\.textContent = `未読菩薩 v\$\{await getVersion\(\)\}`;/u);
});

test('バージョンタブで更新を確認し、見つかった更新を適用できる', () => {
  const versionSettings = mainSource.match(/<section id="version-settings-dialog"[\s\S]*?<\/section>/u)?.[0];

  assert.ok(versionSettings, 'バージョン設定の範囲が見つかりません');
  assert.match(versionSettings, /id="check-app-update"/u);
  assert.match(versionSettings, /id="app-update-status"/u);
  assert.match(versionSettings, /id="install-app-update"/u);
  assert.match(mainSource, /checkAppUpdateButton\.addEventListener\('click', \(\) => \{[\s\S]*?void checkForManualUpdate\(\);/u);
  assert.match(mainSource, /installAppUpdateButton\.addEventListener\('click', \(\) => \{[\s\S]*?void installManualUpdate\(\);/u);
});
