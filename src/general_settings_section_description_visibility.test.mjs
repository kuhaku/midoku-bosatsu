import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('一般設定のセクション説明を開いたときだけ表示する', () => {
  assert.match(
    styleSource,
    /\.settings-section:not\(\[open\]\)\s*>\s*\.settings-section-heading\s+\.settings-section-description\s*\{[\s\S]*?display:\s*none/u,
  );
});
