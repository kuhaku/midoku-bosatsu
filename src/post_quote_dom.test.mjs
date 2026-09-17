import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

// main.ts の起動処理を実行せず、実際の本文描画関数を検証する。
const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const source = main.slice(main.indexOf('function appendTextWithQuoteStyling('), main.indexOf('\nfunction renderFooterErrors('));
class Element {
  children = [];
  className = '';
  appendChild(child) {
    if (child === this) throw new DOMException('The operation would yield an incorrect node tree.', 'HierarchyRequestError');
    this.children.push(child);
  }
}
class Span extends Element {}
const document = {
  createElement: (tag) => tag === 'span' ? new Span() : new Element(),
  createTextNode: (text) => ({ text }),
};
const appendText = runInNewContext(`${stripTypeScriptTypes(source)}; appendTextWithQuoteStyling`, {
  document, HTMLSpanElement: Span,
});

test('span 内の通常本文を自身の子にせず追加する（BIG装飾・無効リンク）', () => {
  const target = new Span();
  target.className = 'existing';
  appendText('通常本文\n続き', target);
  assert.deepEqual(target.children.map((child) => child.text), ['通常本文', '\n', '続き']);
  assert.equal(target.className, 'existing');
});

test('引用行だけを新しい span で包み、後続の通常行を保持する', () => {
  const target = new Span();
  appendText('> 引用\r\n通常本文', target);
  assert.equal(target.children[0].className, 'post-quote');
  assert.equal(target.children[0].children[0].text, '> 引用');
  assert.equal(target.children[1].text, '\r\n');
  assert.equal(target.children[2].text, '通常本文');
  assert.equal(target.className, '');
});
