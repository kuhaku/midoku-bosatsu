import test from 'node:test';
import assert from 'node:assert/strict';

const bbsTimelineMenu = await import('./bbs_timeline_menu.ts').catch(() => null);

test('BBS表示切替メニューは全掲示板と登録順の掲示板を現在の選択状態付きで返す', () => {
  assert.ok(bbsTimelineMenu, 'BBS表示切替メニューの項目生成モジュールが必要です');

  assert.deepEqual(
    bbsTimelineMenu.bbsTimelineMenuItems([
      { id: 'misao', name: 'みさお', enabled: true },
      { id: 'honten', name: '本店', enabled: true },
    ], 'honten'),
    [
      { siteId: null, label: 'すべての掲示板', disabled: false, selected: false },
      { siteId: 'misao', label: 'みさお', disabled: false, selected: false },
      { siteId: 'honten', label: '本店', disabled: false, selected: true },
    ],
  );
});

test('無効なBBSはメニューに残しつつ選択不可にする', () => {
  assert.ok(bbsTimelineMenu, 'BBS表示切替メニューの項目生成モジュールが必要です');

  assert.deepEqual(
    bbsTimelineMenu.bbsTimelineMenuItems([
      { id: 'disabled', name: '停止中BBS', enabled: false },
    ], null),
    [
      { siteId: null, label: 'すべての掲示板', disabled: false, selected: true },
      { siteId: 'disabled', label: '停止中BBS', disabled: true, selected: false },
    ],
  );
});
