import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('./post_url_parameters.ts').catch(() => null);
const remove = (text) => {
  assert.ok(module, 'URLパラメータ削除モジュールが必要です');
  return module.removeOneUrlParameter(text);
};

test('各URLから末尾のパラメータだけを削除し、繰り返し実行できる', () => {
  const text = '本文 https://example.com/?a=1&b=2 https://example.org/?x=3';
  const once = remove(text);
  assert.equal(once, '本文 https://example.com/?a=1 https://example.org/');
  assert.equal(remove(once), '本文 https://example.com/ https://example.org/');
});

test('半角 > で始まる引用行と改行コードをそのまま保持する', () => {
  const text = '>https://example.com/?a=1&b=2\r\n>> https://example.com/?x=1\r\n https://example.com/?a=1&b=2';
  assert.equal(remove(text), '>https://example.com/?a=1&b=2\r\n>> https://example.com/?x=1\r\n https://example.com/?a=1');
});

test('フラグメントと残るパラメータの表記を変更しない', () => {
  assert.equal(remove('https://EXAMPLE.com/?a=%2f+%20&a=2#part?x=1'), 'https://EXAMPLE.com/?a=%2f+%20#part?x=1');
  assert.equal(remove('http://example.com?flag#part'), 'http://example.com#part');
});

test('パラメータのないURLと本文は変更しない', () => {
  const text = '本文 https://example.com/path#part?x=1 https://example.com/?\n空欄';
  assert.equal(remove(text), text);
  assert.equal(remove(''), '');
});

test('引用符や山括弧をURLに含めず、エンコードされた区切りを分割しない', () => {
  assert.equal(remove('<https://example.com/?q=a%26b%3Fc&flag> "https://example.org/?x=1"'), '<https://example.com/?q=a%26b%3Fc> "https://example.org/"');
});
