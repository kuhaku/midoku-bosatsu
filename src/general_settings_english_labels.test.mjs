import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('一般設定のセクション見出しに英語ラベルを表示しない', () => {
  const generalSettings = mainSource.match(/<section id="general-settings-dialog"[\s\S]*?<section id="bbs-settings-dialog"/u)?.[0];
  assert.ok(generalSettings, '一般設定の範囲が見つかりません');

  const summaries = [...generalSettings.matchAll(/<summary class="settings-section-heading">([\s\S]*?)<\/summary>/gu)].map((match) => match[1]);
  assert.ok(summaries.length > 0, '一般設定のセクション見出しが見つかりません');
  for (const summary of summaries) assert.doesNotMatch(summary, /class="status-label"/u);
});
