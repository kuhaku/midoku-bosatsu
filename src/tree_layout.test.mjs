import assert from 'node:assert/strict';
import test from 'node:test';

const treeLayout = await import('./tree_layout.ts').catch(() => null);

test('返信がない葉の本文をノード記号の右に揃える', () => {
  assert.ok(treeLayout, 'ツリー接頭辞生成モジュールが必要です');

  assert.deepEqual(
    treeLayout.buildTreeNodePrefixes({
      depth: 2,
      ancestorSiblingContinues: [true],
      isLastSibling: true,
      hasChildren: false,
    }),
    { headerPrefix: '│└', bodyPrefix: '│　　' },
  );
});

test('ツリーの縦罫線には半角の│だけを使う', () => {
  assert.ok(treeLayout, 'ツリー接頭辞生成モジュールが必要です');

  const prefixes = treeLayout.buildTreeNodePrefixes({
    depth: 2,
    ancestorSiblingContinues: [true],
    isLastSibling: false,
    hasChildren: true,
  });
  assert.deepEqual(prefixes, { headerPrefix: '│├', bodyPrefix: '│││' });
  assert.doesNotMatch(`${prefixes.headerPrefix}${prefixes.bodyPrefix}`, /｜/u);
});
