import test from 'node:test';
import assert from 'node:assert/strict';
import { expandNumericCharacterReferences } from './numeric_character_references.ts';

test('expands decimal and hexadecimal numeric character references', () => {
  assert.equal(
    expandNumericCharacterReferences('開 &#x958B; と &#38283;'),
    '開 開 と 開',
  );
});

test('leaves invalid references unchanged', () => {
  assert.equal(
    expandNumericCharacterReferences('&#0; &#xD800; &#x110000; &#bad;'),
    '&#0; &#xD800; &#x110000; &#bad;',
  );
});
