import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const bundledReaderStyle = readFileSync(new URL('../src-tauri/resources/reader-style.css', import.meta.url), 'utf8');
const appStyle = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('初期の投稿文字色は明るいグレーに統一されている', () => {
  for (const source of [bundledReaderStyle, appStyle]) {
    assert.match(source, /--post-text-color:\s*#f8f9fa;/u);
    assert.match(source, /--post-author-color:\s*#f8f9fa;/u);
    assert.match(source, /--post-subject-color:\s*#f8f9fa;/u);
    assert.match(source, /--unread-badge-text-color:\s*#f8f9fa;/u);
  }
});

test('表示スタイルCSSを設定画面から入出力およびリセットできる', () => {
  const configPanel = mainSource.match(
    /<section id="config-file-settings-dialog"[\s\S]*?id="config-file-settings-message"[\s\S]*?<\/section>/u,
  )?.[0];
  assert.ok(configPanel, '設定ファイルの入出力パネルが見つかりません');
  assert.match(configPanel, /表示スタイルCSS/u);
  assert.match(configPanel, /id="reader-style-export-config-button"/u);
  assert.match(configPanel, /id="reader-style-import-config-button"/u);

  const resetPanel = mainSource.match(
    /<section id="reset-settings-dialog"[\s\S]*?id="reset-settings-message"[\s\S]*?<\/section>/u,
  )?.[0];
  assert.ok(resetPanel, 'リセットパネルが見つかりません');
  assert.match(resetPanel, /表示スタイルCSSのリセット/u);
  assert.match(resetPanel, /id="reset-reader-style"/u);
});
