import test from 'node:test';
import assert from 'node:assert/strict';

const threadVisibility = await import('./thread_visibility.ts').catch(() => null);

test('指定したスレッドは返信を含めて表示対象から除外する', () => {
  assert.ok(threadVisibility, 'スレッド非表示モジュールが必要です');

  const posts = [
    { site_id: 'misao', id: '100', thread_id: null },
    { site_id: 'misao', id: '101', thread_id: '100' },
    { site_id: 'misao', id: '102', thread_id: '100' },
    { site_id: 'misao', id: '200', thread_id: null },
    { site_id: 'other', id: '101', thread_id: '100' },
  ];

  const hidden = new Set(['misao:100']);
  assert.deepEqual(
    threadVisibility.filterHiddenThreadPosts(posts, hidden).map((post) => post.id),
    ['200', '101'],
  );
});

test('スレッドIDがない親投稿は自身の投稿IDを非表示キーにする', () => {
  assert.ok(threadVisibility, 'スレッド非表示モジュールが必要です');

  assert.equal(
    threadVisibility.threadVisibilityKey({ site_id: 'misao', id: '100', thread_id: null }),
    'misao:100',
  );
  assert.equal(
    threadVisibility.threadVisibilityKey({ site_id: 'misao', id: '101', thread_id: '100' }),
    'misao:100',
  );
});
