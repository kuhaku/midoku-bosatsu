import test from 'node:test';
import assert from 'node:assert/strict';

const bookmarks = await import('./bookmarks.ts').catch(() => null);

test('同じタイトルとURLでも選択した項目だけ削除して保存する', async () => {
  const first = { title: '掲示板', url: 'https://example.com/' };
  const second = { ...first };
  const entries = [first, second];
  let raw;
  const storage = { setItem: (_key, value) => { raw = value; }, getItem: () => raw };
  assert.equal(typeof bookmarks.removeBookmark, 'function');
  const next = await bookmarks.removeBookmark(storage, entries, first);
  assert.equal(next.length, 1);
  assert.equal(next[0], second);
  assert.equal(entries.length, 2);
  assert.deepEqual(bookmarks.loadBookmarks(storage), [second]);
  assert.deepEqual(await bookmarks.removeBookmark(storage, next, second), []);
  assert.deepEqual(bookmarks.loadBookmarks(storage), []);
});

test('削除の保存に失敗した場合は一覧を変更しない', async () => {
  const entries = [{ title: '掲示板', url: 'https://example.com/' }];
  assert.equal(typeof bookmarks.removeBookmark, 'function');
  await assert.rejects(() => bookmarks.removeBookmark({ setItem: () => { throw new Error('quota'); } }, entries, entries[0]), /quota/);
  assert.equal(entries.length, 1);
});

test('タイトルとURLを登録し、保存データから登録順に復元する', async () => {
  assert.ok(bookmarks, 'ブックマークの保存処理が必要');
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_key, value) => { raw = value; } };
  await bookmarks.addBookmark(storage, [], '  掲示板  ', ' https://example.com/bbs?q=1#latest ');
  const first = bookmarks.loadBookmarks(storage);
  assert.deepEqual(first, [{ title: '掲示板', url: 'https://example.com/bbs?q=1#latest' }]);
  await bookmarks.addBookmark(storage, first, '次のリンク', 'http://example.org/');
  assert.deepEqual(bookmarks.loadBookmarks(storage).map(item => item.title), ['掲示板', '次のリンク']);
});

test('空タイトルと不正URLを拒否し、保存しない', async () => {
  assert.ok(bookmarks);
  const storage = { setItem: () => assert.fail('保存してはいけない') };
  for (const [title, url] of [['  ', 'https://example.com'], ['題名', 'javascript:alert(1)'], ['題名', '/relative'], ['題名', '']]) {
    await assert.rejects(() => bookmarks.addBookmark(storage, [], title, url));
  }
});

test('壊れた保存内容を扱い、不正なエントリを除外する', async () => {
  assert.ok(bookmarks);
  for (const raw of [null, '{broken', '{}']) {
    assert.deepEqual(bookmarks.loadBookmarks({ getItem: () => raw }), []);
  }
  const raw = JSON.stringify([null, { title: '危険', url: 'javascript:alert(1)' }, { title: '正常', url: 'https://example.com/' }]);
  assert.deepEqual(bookmarks.loadBookmarks({ getItem: () => raw }), [{ title: '正常', url: 'https://example.com/' }]);
});

test('保存失敗を呼び出し元へ通知して既存一覧を維持する', async () => {
  assert.ok(bookmarks);
  const entries = [{ title: '既存', url: 'https://example.com/' }];
  await assert.rejects(() => bookmarks.addBookmark({ setItem: () => { throw new Error('quota'); } }, entries, '新規', 'https://example.org/'), /quota/);
  assert.equal(entries.length, 1);
});
