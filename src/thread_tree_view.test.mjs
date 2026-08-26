import test from 'node:test';
import assert from 'node:assert/strict';

const threadTreeView = await import('./thread_tree_view.ts').catch(() => null);

test('ツリー表示がOFFでスレッドURLがある投稿にだけ木リンクを表示する', () => {
  assert.ok(threadTreeView, 'スレッドツリー表示モジュールが必要です');

  assert.equal(threadTreeView.shouldShowThreadTreeLink(false, 'https://bbs.example/thread/100', false), true);
  assert.equal(threadTreeView.shouldShowThreadTreeLink(true, 'https://bbs.example/thread/100', false), false);
  assert.equal(threadTreeView.shouldShowThreadTreeLink(false, 'https://bbs.example/thread/100', true), false);
  assert.equal(threadTreeView.shouldShowThreadTreeLink(false, null, false), false);
  assert.equal(threadTreeView.shouldShowThreadTreeLink(false, '   ', false), false);
});

test('木と消リンクをそれぞれ独立した設定で非表示にする', () => {
  assert.ok(threadTreeView, 'スレッドツリー表示モジュールが必要です');

  assert.equal(
    threadTreeView.shouldShowThreadHideLink('https://bbs.example/thread/100', false),
    true,
  );
  assert.equal(
    threadTreeView.shouldShowThreadHideLink('https://bbs.example/thread/100', true),
    false,
  );
  assert.equal(
    threadTreeView.shouldShowThreadHideLink('https://bbs.example/thread/100', false),
    true,
  );
  assert.equal(
    threadTreeView.shouldShowThreadHideLink(null, false),
    false,
  );
});

test('木で開いたスレッド画面は一般設定に関係なくツリー表示する', () => {
  assert.ok(threadTreeView, 'スレッドツリー表示モジュールが必要です');

  assert.equal(threadTreeView.shouldRenderActionViewAsTree('tree', false), true);
  assert.equal(threadTreeView.shouldRenderActionViewAsTree('tree', true), true);
  assert.equal(threadTreeView.shouldRenderActionViewAsTree('thread', false), false);
  assert.equal(threadTreeView.shouldRenderActionViewAsTree('thread', true), true);
});
