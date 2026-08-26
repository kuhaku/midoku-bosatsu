import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const postCopyFormat = await import('./post_copy_format.ts').catch(() => null);

test('画面の通常投稿1行目は従来の構成を維持する', () => {
  assert.doesNotMatch(mainSource, /appendRegularPostFirstLine/u);
  assert.match(mainSource, /primaryMeta\.append\(buildPostDateActions\(post, false\)\);/u);
});

test('コピー用の1行目は投稿者ラベルと空投稿者の全角スペースを含む', () => {
  assert.ok(postCopyFormat, 'コピー用の投稿1行目整形モジュールが必要です');
  assert.equal(
    postCopyFormat.formatCopiedPostFirstLine({
      title: '題名',
      author: '',
      postedAt: '2026/08/27(木)12時34分56秒',
      actions: '　■　◆',
    }),
    '題名 　投稿者：　 　投稿日：2026/08/27(木)12時34分56秒　■　◆',
  );
});

test('コピー用の題名は空を補完せず、全角の＞だけを＞　にする', () => {
  assert.ok(postCopyFormat, 'コピー用の投稿1行目整形モジュールが必要です');
  assert.equal(
    postCopyFormat.formatCopiedPostFirstLine({
      title: '',
      author: '投稿者',
      postedAt: '2026/08/27(木)12時34分56秒',
      actions: '　■　◆',
    }),
    ' 　投稿者：投稿者 　投稿日：2026/08/27(木)12時34分56秒　■　◆',
  );
  assert.equal(
    postCopyFormat.formatCopiedPostFirstLine({
      title: '＞',
      author: '投稿者',
      postedAt: '2026/08/27(木)12時34分56秒',
      actions: '　■　◆',
    }),
    '＞　 　投稿者：投稿者 　投稿日：2026/08/27(木)12時34分56秒　■　◆',
  );
});
