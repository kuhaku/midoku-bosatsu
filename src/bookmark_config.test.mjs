import test from 'node:test';
import assert from 'node:assert/strict';
const config = await import('./bookmark_config.ts').catch(() => null);

test('未設定の場合は未読菩薩を初期値として保存する', async () => {
  let saved;
  const entries = await config.loadBookmarkConfig(async () => null, () => [], async value => { saved = value; });
  assert.deepEqual(entries, [{ title: '未読菩薩', url: 'https://github.com/kuhaku/midoku-bosatsu' }]);
  assert.deepEqual(saved, entries);
});

test('設定ファイルがある場合は空一覧でも旧データより優先する', async () => {
  assert.ok(config);
  const result = await config.loadBookmarkConfig(async () => [], () => assert.fail('旧データを読まない'), async () => assert.fail('書き込まない'));
  assert.deepEqual(result, []);
});

test('設定ファイルがない場合だけ旧ブックマークを移行する', async () => {
  assert.ok(config);
  const legacy = [{ title: '掲示板', url: 'https://example.com/' }];
  let saved;
  const result = await config.loadBookmarkConfig(async () => null, () => legacy, async entries => { saved = entries; });
  assert.deepEqual(result, legacy);
  assert.deepEqual(saved, legacy);
});

test('読み込み失敗や移行保存失敗を握りつぶさない', async () => {
  assert.ok(config);
  await assert.rejects(config.loadBookmarkConfig(async () => { throw new Error('read'); }, () => [], async () => assert.fail()), /read/);
  await assert.rejects(config.loadBookmarkConfig(async () => null, () => [], async () => { throw new Error('write'); }), /write/);
});
