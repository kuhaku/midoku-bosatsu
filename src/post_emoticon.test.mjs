import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('./post_emoticon.ts').catch(() => null);

function setup(value, focused, position = 0) {
  const document = { activeElement: null };
  const body = Object.assign(new EventTarget(), {
    value, selectionStart: position, selectionEnd: position, ownerDocument: document,
    focus() { document.activeElement = this; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  });
  const button = new EventTarget();
  document.activeElement = focused ? body : button;
  assert.ok(module, '顔文字挿入処理が必要です');
  module.bindPostEmoticonButton(button, body, '(;´Д`)');
  return { body, button, document };
}

test('内容欄のカーソル位置に挿入し、直後へカーソルを移動してinputを通知する', () => {
  const { body, button, document } = setup('前後', true, 1);
  let inputs = 0;
  body.addEventListener('input', (event) => { assert.equal(event.bubbles, true); inputs++; });
  const down = new Event('pointerdown', { cancelable: true });
  button.dispatchEvent(down);
  // ボタンへのフォーカス移動をキャンセルしなければ、クリック前に内容欄がぼける。
  if (!down.defaultPrevented) document.activeElement = button;
  button.dispatchEvent(new Event('click'));
  assert.equal(body.value, '前(;´Д`)後');
  assert.equal(body.selectionStart, 7);
  assert.equal(body.selectionEnd, 7);
  assert.equal(document.activeElement, body);
  assert.equal(inputs, 1);
});

test('内容欄にフォーカスがなければ過去のカーソル位置ではなく末尾に挿入する', () => {
  const { body, button } = setup('前後', false, 1);
  button.dispatchEvent(new Event('click'));
  assert.equal(body.value, '前後(;´Д`)');
  assert.equal(body.selectionStart, 8);
});

test('空欄にも挿入でき、連続クリックで顔文字を連続挿入する', () => {
  const { body } = setup('', false);
  const button = new EventTarget();
  module.bindPostEmoticonButton(button, body, 'ヽ(´ー｀)ノ');
  button.dispatchEvent(new Event('click'));
  button.dispatchEvent(new Event('click'));
  assert.equal(body.value, 'ヽ(´ー｀)ノヽ(´ー｀)ノ');
  assert.equal(body.selectionStart, 14);
});
