import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postFormFieldGroup,
  postFormFieldItemOrder,
  postFormFieldWidth,
  postFormLabelLayout,
} from './post_form_field_layout.ts';

test('投稿フォームの入力欄を配置先ごとに分類する', () => {
  assert.equal(postFormFieldGroup('author'), 'author-row');
  assert.equal(postFormFieldGroup('email'), 'email-row');
  assert.equal(postFormFieldGroup('subject'), 'subject-actions');
  assert.equal(postFormFieldGroup('body'), 'main');
  assert.equal(postFormFieldGroup('url'), 'main');
});

test('本文以外のラベルと入力欄を横並びにする', () => {
  assert.equal(postFormLabelLayout('subject'), 'inline');
  assert.equal(postFormLabelLayout('author'), 'inline');
  assert.equal(postFormLabelLayout('email'), 'inline');
  assert.equal(postFormLabelLayout('body'), 'stacked');
  assert.equal(postFormLabelLayout('url'), 'inline');
});

test('投稿者名とメールの入力欄だけを短い幅にする', () => {
  assert.equal(postFormFieldWidth('author'), 'compact');
  assert.equal(postFormFieldWidth('email'), 'compact');
  assert.equal(postFormFieldWidth('subject'), 'fluid');
  assert.equal(postFormFieldWidth('body'), 'fluid');
  assert.equal(postFormFieldWidth('url'), 'fluid');
});

test('文字コード警告を内容フィールドの直前に配置する', () => {
  assert.deepEqual(postFormFieldItemOrder('body'), ['encoding-warning', 'field']);
  assert.deepEqual(postFormFieldItemOrder('url'), ['field']);
});
