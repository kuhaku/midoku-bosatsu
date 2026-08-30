import test from 'node:test';
import assert from 'node:assert/strict';

const bbsTimelineShortcut = await import('./bbs_timeline_shortcut.ts').catch(() => null);

test('Ctrl/Command+数字の対象はbbs.tomlの登録順で先頭9掲示板までになる', () => {
  assert.ok(bbsTimelineShortcut, 'BBSタイムライン用ショートカット判定モジュールが必要です');

  const sites = [
    { id: 'first' },
    { id: 'second' },
    { id: 'third' },
    { id: 'fourth' },
    { id: 'fifth' },
    { id: 'sixth' },
    { id: 'seventh' },
    { id: 'eighth' },
    { id: 'ninth' },
    { id: 'tenth' },
  ];

  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '1'), 'first');
  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '9'), 'ninth');
  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '0'), null);
  assert.equal(bbsTimelineShortcut.bbsTimelineSelectionForShortcutKey(sites, '10'), undefined);
});

test('選択したBBSの投稿だけをタイムラインに残す', () => {
  assert.ok(bbsTimelineShortcut, 'BBSタイムライン用フィルタが必要です');

  const posts = [
    { site_id: 'first', id: '1' },
    { site_id: 'second', id: '2' },
    { site_id: 'first', id: '3' },
  ];

  assert.deepEqual(
    bbsTimelineShortcut.filterPostsForBbsTimeline(posts, 'first'),
    [{ site_id: 'first', id: '1' }, { site_id: 'first', id: '3' }],
  );
  assert.deepEqual(bbsTimelineShortcut.filterPostsForBbsTimeline(posts, null), posts);
});
