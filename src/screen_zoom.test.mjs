import test from 'node:test';
import assert from 'node:assert/strict';

const zoom = await import('./screen_zoom.ts').catch(() => null);
const event = (overrides = {}) => ({ key: '-', code: 'Minus', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, ...overrides });

test('CtrlまたはCommandとマイナスで縮小し、Shift併用で拡大する', () => {
  assert.ok(zoom, '画面拡大縮小モジュールが必要');
  for (const modifier of [{ ctrlKey: true }, { ctrlKey: false, metaKey: true }]) {
    assert.equal(zoom.screenZoomDirection(event(modifier)), -1);
    assert.equal(zoom.screenZoomDirection(event({ ...modifier, shiftKey: true, key: '_' })), 1);
    assert.equal(zoom.screenZoomDirection(event({ ...modifier, shiftKey: true, key: '-', code: '' })), 1);
  }
});

test('通常入力・Alt併用・IME変換中・別のキーは処理しない', () => {
  assert.ok(zoom);
  for (const overrides of [{ ctrlKey: false }, { altKey: true }, { isComposing: true }, { key: '0', code: 'Digit0' }]) {
    assert.equal(zoom.screenZoomDirection(event(overrides)), 0);
  }
});

test('倍率を10%刻みで変更し50%〜200%の範囲に収める', () => {
  assert.ok(zoom);
  assert.equal(zoom.nextScreenZoom(1, -1), 0.9);
  assert.equal(zoom.nextScreenZoom(0.9, 1), 1);
  assert.equal(zoom.nextScreenZoom(1, 1), 1.1);
  assert.equal(zoom.nextScreenZoom(0.5, -1), 0.5);
  assert.equal(zoom.nextScreenZoom(2, 1), 2);
});

test('倍率をポップアップ表示し、連続操作時は最新倍率で表示時間を延長する', (t) => {
  assert.equal(typeof zoom.createScreenZoomNotice, 'function');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const popup = {
    textContent: '', open: false,
    showPopover() { this.open = true; },
    hidePopover() { this.open = false; },
  };
  const show = zoom.createScreenZoomNotice(popup);
  show(0.9);
  assert.equal(popup.textContent, '表示倍率：90%');
  assert.equal(popup.open, true);
  t.mock.timers.tick(1500);
  show(1.1);
  assert.equal(popup.textContent, '表示倍率：110%');
  t.mock.timers.tick(1500);
  assert.equal(popup.open, true);
  t.mock.timers.tick(500);
  assert.equal(popup.open, false);
});
