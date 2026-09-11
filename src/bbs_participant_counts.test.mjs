import test from 'node:test';
import assert from 'node:assert/strict';

const participantCounts = await import('./bbs_participant_counts.ts').catch(() => null);

test('有効なBBSを設定順に並べ、取得人数を「名」で表示する', () => {
  assert.ok(participantCounts, '参加者数の表示モデルが必要です');
  const sites = [
    { id: 'bbs1', name: 'BBS1', enabled: true },
    { id: 'disabled', name: '無効', enabled: false },
    { id: 'bbs2', name: 'BBS2', enabled: true },
  ];
  const counts = new Map([['bbs1', 3], ['bbs2', 10]]);

  assert.deepEqual(participantCounts.participantCountItems(sites, counts), [
    { siteId: 'bbs1', siteName: 'BBS1', countLabel: '3名' },
    { siteId: 'bbs2', siteName: 'BBS2', countLabel: '10名' },
  ]);
});

test('人数を抽出できなかったBBSは「?名」と表示する', () => {
  assert.ok(participantCounts, '参加者数の表示モデルが必要です');
  const sites = [{ id: 'bbs1', name: 'BBS1', enabled: true }];

  assert.deepEqual(participantCounts.participantCountItems(sites, new Map([['bbs1', null]])), [
    { siteId: 'bbs1', siteName: 'BBS1', countLabel: '?名' },
  ]);
  assert.deepEqual(participantCounts.participantCountItems(sites, new Map()), [
    { siteId: 'bbs1', siteName: 'BBS1', countLabel: '?名' },
  ]);
});

test('現在の参加者表示をOFFにすると表示項目を返さない', () => {
  assert.ok(participantCounts, '参加者数の表示モデルが必要です');
  const sites = [{ id: 'bbs1', name: 'BBS1', enabled: true }];
  const counts = new Map([['bbs1', 3]]);

  assert.deepEqual(participantCounts.participantCountItems(sites, counts, false), []);
});

test('現在の参加者表示が未指定ならONとして扱う', () => {
  assert.ok(participantCounts, '参加者数の表示モデルが必要です');
  const sites = [{ id: 'bbs1', name: 'BBS1', enabled: true }];

  assert.equal(participantCounts.participantCountItems(sites, new Map()).length, 1);
});
