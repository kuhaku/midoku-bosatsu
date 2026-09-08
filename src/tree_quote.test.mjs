import assert from 'node:assert/strict';
import test from 'node:test';

const treeQuote = await import('./tree_quote.ts').catch(() => null);

test('親本文と一致する引用行はツリー本文から省略する', () => {
  assert.ok(treeQuote, 'ツリー引用判定モジュールが必要です');

  assert.equal(
    treeQuote.shouldKeepTreeQuoteLine('> あ～ビッグスクーター買おっかな～', 'あ～ビッグスクーター買おっかな～'),
    false,
  );
});

test('親本文から改変された引用行はツリー本文に残す', () => {
  assert.ok(treeQuote, 'ツリー引用判定モジュールが必要です');

  assert.equal(
    treeQuote.shouldKeepTreeQuoteLine('> あ～ビッグモーター買おっかな～', 'あ～ビッグスクーター買おっかな～'),
    true,
  );
});

test('親本文の複数行のうち一致した引用行だけを省略する', () => {
  assert.ok(treeQuote, 'ツリー引用判定モジュールが必要です');

  assert.equal(treeQuote.shouldKeepTreeQuoteLine('> 1行目', '1行目\n2行目'), false);
  assert.equal(treeQuote.shouldKeepTreeQuoteLine('> 改変した2行目', '1行目\n2行目'), true);
});
