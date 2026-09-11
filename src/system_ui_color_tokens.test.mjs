import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styleSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('システムUIの色はルートのCSS変数から参照する', () => {
  const rootBlock = styleSource.match(/^:root\s*\{[\s\S]*?^\}/mu)?.[0];
  assert.ok(rootBlock, ':root のカラートークン定義が見つかりません');

  const systemUiStyles = styleSource.slice(rootBlock.length);
  const directColor = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(/iu;

  assert.doesNotMatch(
    systemUiStyles,
    directColor,
    'システムUIの直接的な色指定は :root のCSS変数に定義してください',
  );
});

test('近いシステムUI色を共有トークンへ集約する', () => {
  const rootBlock = styleSource.match(/^:root\s*\{[\s\S]*?^\}/mu)?.[0];
  assert.ok(rootBlock, ':root のカラートークン定義が見つかりません');

  assert.doesNotMatch(
    rootBlock,
    /--color-(?:panel-soft|badge|saved(?:-hover)?|action-view-backdrop|status-background-opaque|shadow-(?:menu|popover|soft|status|dialog|image|action-view)):/u,
    '近い色は共有トークンへ集約してください',
  );
  assert.match(rootBlock, /--color-shadow-subtle:/u);
  assert.match(rootBlock, /--color-shadow:/u);
  assert.match(rootBlock, /--color-shadow-strong:/u);
});
