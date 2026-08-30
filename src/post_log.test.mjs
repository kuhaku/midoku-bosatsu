import test from 'node:test';
import assert from 'node:assert/strict';

const postLog = await import('./post_log.ts').catch(() => null);

function post(id, postedAt, siteId = 'misao') {
  return {
    id,
    site_id: siteId,
    title: '題名',
    name: '名無し',
    email: '',
    posted_at_raw: '2026/08/26(水)12時00分00秒',
    posted_at: postedAt,
    follow_url: null,
    thread_url: null,
    parent_id: null,
    thread_id: null,
    body_html: '本文',
    body_text: '本文',
  };
}

test('投稿ログは保存済み投稿を復元し、壊れた値は空として扱う', () => {
  assert.ok(postLog, '投稿ログを復元するモジュールが必要です');

  const savedPost = post('100', '2026-08-26T12:00:00Z');
  assert.deepEqual(postLog.parsePostLog(JSON.stringify([savedPost])), [savedPost]);
  assert.deepEqual(postLog.parsePostLog('{broken'), []);
  assert.deepEqual(postLog.parsePostLog(JSON.stringify({ posts: [] })), []);
  assert.deepEqual(postLog.parsePostLog(JSON.stringify([{ site_id: 'misao', id: '100', posted_at: null }])), []);
});

test('投稿ログは全BBSを合わせて最新日時順で上限件数だけを保持する', () => {
  assert.ok(postLog, '共通の投稿ログ上限処理モジュールが必要です');

  const misaoOlder = post('1', '2026-08-26T10:00:00Z');
  const misaoNewest = post('3', '2026-08-26T12:00:00Z');
  const misaoMiddle = post('2', '2026-08-26T11:00:00Z');
  const hontenOlder = post('1', '2026-08-26T10:30:00Z', 'honten');
  const hontenNewest = post('2', '2026-08-26T11:30:00Z', 'honten');

  assert.deepEqual(
    postLog.limitPostLog(
      [misaoOlder, misaoNewest, misaoMiddle, hontenOlder, hontenNewest],
      3,
    ),
    [misaoNewest, hontenNewest, misaoMiddle],
  );
});

test('投稿ログは上限整理後の内容だけを保存し、リセットで消去できる', () => {
  assert.ok(postLog, '投稿ログを保存するモジュールが必要です');

  const values = new Map();
  const storage = {
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
  };
  const posts = [
    post('1', '2026-08-26T10:00:00Z'),
    post('2', '2026-08-26T11:00:00Z'),
  ];

  postLog.savePostLog(storage, 'post-log', posts, 1);
  assert.deepEqual(postLog.parsePostLog(storage.getItem('post-log')), [posts[1]]);

  postLog.clearPostLog(storage, 'post-log');
  assert.equal(storage.getItem('post-log'), null);
});
