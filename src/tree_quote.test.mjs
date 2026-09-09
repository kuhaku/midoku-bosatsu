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

test('画像詳細UIを除いた引用が親本文と一致するときはツリー本文から省略する', () => {
  assert.ok(treeQuote, 'ツリー引用判定モジュールが必要です');

  const imageUrl = 'https://example.com/image.png';
  const quoteText = treeQuote.treeQuoteSourceText([
    { text: '> ', generated: false },
    { text: '[詳]', generated: true },
    { text: imageUrl, generated: false },
  ]);

  assert.equal(treeQuote.shouldKeepTreeQuoteLine(quoteText, imageUrl), false);
});

test('引用開始要素の後に分離された画像URLも同じ引用行として照合する', () => {
  assert.ok(treeQuote, 'ツリー引用判定モジュールが必要です');

  const imageUrl = 'https://example.com/image.png';
  const quoteText = treeQuote.treeQuoteSourceText([
    { text: '> ', generated: false },
    { text: '[詳]', generated: true },
    { text: imageUrl, generated: false },
    { text: '', generated: false, endsLine: true },
    { text: '引用ではない次の行', generated: false },
  ]);

  assert.equal(treeQuote.shouldKeepTreeQuoteLine(quoteText, imageUrl), false);
});
