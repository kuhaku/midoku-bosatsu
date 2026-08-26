import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('一般設定の各セクションをクリックで展開・収納できる', () => {
  const mainSource = read('./main.ts');
  const styleSource = read('./style.css');
  const generalSettings = mainSource.match(/<section id="general-settings-dialog"[\s\S]*?<section id="bbs-settings-dialog"/u)?.[0];

  assert.ok(generalSettings, '一般設定の範囲が見つかりません');
  assert.match(generalSettings, /<details class="settings-section">/u);
  assert.doesNotMatch(generalSettings, /<details class="settings-section" open>/u);
  assert.match(generalSettings, /<summary class="settings-section-heading">/u);
  assert.match(styleSource, /\.settings-section\s*>\s*\.settings-section-heading\s*\{[\s\S]*?justify-content:\s*flex-start[\s\S]*?cursor:\s*pointer/u);
  assert.match(styleSource, /settings-section-heading::before/u);
  assert.match(styleSource, /\.settings-section:not\(\[open\]\)/u);
});
