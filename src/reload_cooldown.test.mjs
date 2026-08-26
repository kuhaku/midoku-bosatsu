import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartUnreadReload } from './reload_cooldown.ts';

test('未取得の間は未読リロードできない', () => {
  assert.equal(canStartUnreadReload(null, 30_000), false);
});

test('取得完了から30秒未満は未読リロードできない', () => {
  assert.equal(canStartUnreadReload(0, 29_999), false);
});

test('取得完了から30秒ちょうどで未読リロードできる', () => {
  assert.equal(canStartUnreadReload(0, 30_000), true);
});
