import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('BBS設定の保存後に投稿ログを現在のBBS設定に合わせて初期化する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const applyBbsConfig = main.match(/async function applyBbsConfigAfterSave\(loadedConfig: ReaderConfig\): Promise<void> \{([\s\S]*?)\n\}/u)?.[1] ?? '';

  assert.match(applyBbsConfig, /config = loadedConfig;[\s\S]*postsByKey\.clear\(\);\s*persistPostLog\(\);/u);
});
