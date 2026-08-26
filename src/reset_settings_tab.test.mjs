import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

test('設定画面にリセットタブと6つのリセットセクションを表示する', () => {
  assert.match(mainSource, /id="settings-tab-reset"[\s\S]*?>リセット<\/button>/u);
  assert.match(mainSource, /id="reset-settings-dialog"[\s\S]*?<h2>リセット<\/h2>/u);
  assert.match(mainSource, /<h3>レス通知<\/h3>/u);
  assert.match(mainSource, /<h3>非表示スレッド<\/h3>/u);
  assert.match(mainSource, /<h3>一般設定のリセット<\/h3>/u);
  assert.match(mainSource, /<h3>BBS設定のリセット<\/h3>/u);
  assert.match(mainSource, /<h3>未読状態リセット<\/h3>/u);
  assert.match(mainSource, /<h3>取得ログ削除<\/h3>/u);
});

test('一般設定・BBS設定を同梱設定へリセットするコマンドを使う', () => {
  assert.match(mainSource, /id="reset-general-settings"/u);
  assert.match(mainSource, /id="reset-bbs-settings"/u);
  assert.match(mainSource, /invoke<ReaderConfig>\('reset_config_to_bundled'/u);
  assert.match(mainSource, /resetConfigToBundled\('global\.toml'\)/u);
  assert.match(mainSource, /resetConfigToBundled\('bbs\.toml'\)/u);
});

test('設定リセットの成功結果をリセットタブに表示する', () => {
  assert.match(mainSource, /id="reset-settings-message"/u);
  assert.match(mainSource, /リセット成功しました/u);
});

test('リセットタブは追跡・非表示の選択項目を削除するコマンドを使う', () => {
  assert.match(mainSource, /get_reply_notification_tracked_roots/u);
  assert.match(mainSource, /remove_reply_notification_tracked_roots/u);
  assert.match(mainSource, /get_hidden_threads/u);
  assert.match(mainSource, /remove_hidden_threads/u);
  assert.match(mainSource, />選択した通知設定を消す<\/button>/u);
  assert.match(mainSource, />選択した非表示設定を消す<\/button>/u);
});
