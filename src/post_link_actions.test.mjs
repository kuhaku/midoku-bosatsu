import test from 'node:test';
import assert from 'node:assert/strict';
import { isReferencePostLink } from './post_link_actions.ts';

test('参考リンクはフォロー投稿アクションとして扱う', () => {
  assert.equal(isReferencePostLink('参考：2026/08/28(金) 00:15:18'), true);
  assert.equal(isReferencePostLink('参考:2026/08/28(金) 00:15:18'), true);
});

test('参考リンク以外は外部リンクとして扱う', () => {
  assert.equal(isReferencePostLink('https://example.com/'), false);
  assert.equal(isReferencePostLink('参考情報'), false);
});

test('本文リンク生成は参考リンクをフォロー投稿アクションへ振り分ける', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /isReferencePostLink\(child\.textContent \?\? ''\)/u);
  assert.match(main, /element\.dataset\.bbsActionHref = href/u);
  assert.match(main, /element\.dataset\.bbsActionKind = 'follow'/u);
});
