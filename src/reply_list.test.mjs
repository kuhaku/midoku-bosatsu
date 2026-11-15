import test from 'node:test';
import assert from 'node:assert/strict';
import * as replies from './reply_notification.ts';

const post = (id, parent_id = null, site_id = 'a') => ({ id, parent_id, site_id, thread_id: null });
const state = { automatic: [{ site_id: 'a', post_id: '1' }, { site_id: 'a', post_id: '4' }], manual: [{ site_id: 'a', post_id: '9' }] };

test('自分の投稿への直接返信だけを抽出し、自己返信と手動追跡を除外する', () => {
  assert.equal(typeof replies.repliesToOwnPosts, 'function');
  const posts = [post('1'), post('2', '1'), post('3', '2'), post('4', '1'), post('5', '9'), post('6', '1', 'b')];
  assert.deepEqual(replies.repliesToOwnPosts(posts, state).map(p => p.id), ['2']);
});

test('親投稿がログから消えていても返信を抽出し、既読状態と入力順を保つ', () => {
  assert.equal(typeof replies.repliesToOwnPosts, 'function');
  const posts = [{ ...post('8', '1'), timeline_read: true }, post('7', '1')];
  assert.deepEqual(replies.repliesToOwnPosts(posts, state), posts);
  assert.deepEqual(replies.repliesToOwnPosts(posts, { automatic: [], manual: state.manual }), []);
});


test('左ナビは未読レスがあるときだけ件数を表示し、0件に戻ると括弧も消す', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const body = source.match(/function updateReplyList\(\): void \{([\s\S]*?)\n\}/u)?.[1];
  assert.ok(body);
  const update = new Function('replyListButton', 'replyUnreadCount', 'ownReplyPosts', 'savedPostsView', body);
  const button = { textContent: '' };
  for (const [count, label] of [[0, 'レス一覧'], [3, 'レス一覧 (3)'], [1, 'レス一覧 (1)'], [0, 'レス一覧']]) {
    update(button, () => count, () => [], { hidden: true });
    assert.equal(button.textContent, label);
  }
});
