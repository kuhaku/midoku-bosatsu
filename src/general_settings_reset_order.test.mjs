import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('リセット項目を専用タブに配置する', () => {
  const mainSource = read('./main.ts');
  const resetSettings = mainSource.match(/<section id="reset-settings-dialog"[\s\S]*?<\/section>\n      <\/div>/u)?.[0];

  assert.ok(resetSettings, 'リセットタブの範囲が見つかりません');
  assert.match(resetSettings, /<h3>未読状態リセット<\/h3>/u);
  assert.match(resetSettings, /<h3>取得ログ削除<\/h3>/u);
});
