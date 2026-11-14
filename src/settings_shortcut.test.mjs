import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const handlerStart = source.indexOf("document.addEventListener('keydown', async (event) => {")
  + "document.addEventListener('keydown', async (event) => {".length;
const handlerEnd = source.indexOf("  if (event.key === 'Escape' && !postContextMenu.hidden)", handlerStart);
const handle = new Function('event', 'settingsDialog', 'openSettings', 'screenZoomDirection', source.slice(handlerStart, handlerEnd));

function press(overrides = {}, hidden = true) {
  let opened = 0;
  let prevented = 0;
  handle({ key: ',', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false,
    isComposing: false, ...overrides, preventDefault() { prevented++; } },
  { hidden }, () => opened++, () => 0);
  return { opened, prevented };
}

test('CtrlまたはCommand + ,で設定画面を開く', () => {
  assert.deepEqual(press(), { opened: 1, prevented: 1 });
  assert.deepEqual(press({ ctrlKey: false, metaKey: true }), { opened: 1, prevented: 1 });
});

test('設定画面を開いているときは再初期化せず編集中の設定を保つ', () => {
  assert.deepEqual(press({}, false), { opened: 0, prevented: 1 });
});

test('通常のカンマ入力・別キー・追加修飾キー・IME変換中は設定を開かない', () => {
  for (const overrides of [{ ctrlKey: false }, { key: '.' }, { altKey: true },
    { shiftKey: true }, { isComposing: true }]) {
    assert.deepEqual(press(overrides), { opened: 0, prevented: 0 });
  }
});
