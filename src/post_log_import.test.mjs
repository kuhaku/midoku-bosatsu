import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('一般設定のインポート直後に保存済み投稿ログへ新しい上限を適用する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const globalImportBranch = main.match(/if \(fileName === 'global\.toml'\) \{([\s\S]*?)\n    \} else \{/u)?.[1] ?? '';

  assert.match(globalImportBranch, /applyDisplayConfig\(loadedConfig\.global\);[\s\S]*mergePosts\(\[\]\);/u);
});
