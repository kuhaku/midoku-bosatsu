import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('設定のインポート/エクスポートタブの表示文言を日本語化する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const configFilePanel = main.match(
    /<section id="config-file-settings-dialog"[\s\S]*?id="config-file-settings-message"[\s\S]*?<\/section>/u,
  )?.[0] ?? '';

  assert.match(main, />設定のインポート\/エクスポート<\/button>/u);
  assert.match(configFilePanel, /<h2>設定のインポート\/エクスポート<\/h2>/u);
  assert.doesNotMatch(configFilePanel, /GENERAL CONFIG|BBS CONFIG/u);
  assert.match(configFilePanel, /<h3>一般設定<\/h3>/u);
  assert.match(configFilePanel, /<h3>BBS設定<\/h3>/u);
  assert.match(configFilePanel, />一般設定をファイルにエクスポート<\/button>/u);
  assert.match(configFilePanel, />一般設定をファイルからインポート<\/button>/u);
  assert.match(configFilePanel, />BBS設定をファイルにエクスポート<\/button>/u);
  assert.match(configFilePanel, />BBS設定をファイルからインポート<\/button>/u);
  assert.doesNotMatch(configFilePanel, /global\.tomlを(?:エクスポート|インポート)|bbs\.tomlを(?:エクスポート|インポート)/u);
  assert.match(configFilePanel, /class="settings-section config-file-settings-section"/u);
  assert.match(style, /\.config-file-settings-section > \.settings-section-heading::before\s*\{[^}]*content:\s*none;/u);
});
