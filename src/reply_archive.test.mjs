import test from 'node:test';
import assert from 'node:assert/strict';
import * as archive from './reply_archive.ts';
const post = (id, site_id = 'a') => ({ id, site_id, title: '', name: '', email: '', posted_at_raw: '', posted_at: null, follow_url: null, thread_url: null, parent_id: 'own', thread_id: null, body_html: '本文', body_text: '本文' });

test('返信は再起動・ログ削除・追跡終了後も本文と未読状態を保持する', () => {
  let state = archive.parseReplyArchive(null);
  state = archive.addArchivedReplies(state, [post('1'), post('2')], () => true);
  state = archive.parseReplyArchive(JSON.stringify(state));
  state = archive.addArchivedReplies(state, [], () => false);
  assert.equal(state.posts.length, 2);
  assert.equal(state.posts[0].body_text, '本文');
  assert.equal(state.posts[0].reply_unread, true);
});

test('再取得は重複せず、既読にしたレスを未読に戻さない', () => {
  let state = archive.addArchivedReplies(archive.parseReplyArchive(null), [post('1')], () => true);
  state = archive.readArchivedReplies(state, [post('1')]);
  state = archive.addArchivedReplies(state, [post('1')], () => true);
  assert.equal(state.posts.length, 1);
  assert.equal(state.posts[0].reply_unread, false);
});

test('手動削除したレスは再起動・再取得で復活せず、別BBSの同じIDには影響しない', () => {
  let state = archive.addArchivedReplies(archive.parseReplyArchive(null), [post('1'), post('1', 'b')], () => true);
  state = archive.deleteArchivedReply(state, post('1'));
  state = archive.parseReplyArchive(JSON.stringify(state));
  state = archive.addArchivedReplies(state, [post('1')], () => true);
  assert.deepEqual(state.posts.map(p => p.site_id), ['b']);
});
