import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNewPostDestinationLabel,
  shouldConfirmNewPostSiteChange,
} from './new_post_destination.ts';

test('投稿先ラベルには選択中の掲示板名を含める', () => {
  assert.equal(formatNewPostDestinationLabel('あやしいわーるど＠みさお'), '投稿先: あやしいわーるど＠みさお');
});

test('新規投稿フォームが未編集なら掲示板切り替えの確認を省略する', () => {
  assert.equal(shouldConfirmNewPostSiteChange(false), false);
});

test('新規投稿フォームを編集済みなら掲示板切り替えを確認する', () => {
  assert.equal(shouldConfirmNewPostSiteChange(true), true);
});
