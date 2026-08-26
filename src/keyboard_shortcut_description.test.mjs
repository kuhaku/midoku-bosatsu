import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('キーボード操作設定にdキーで投稿を保存できる説明がある', () => {
  const keyboardSection = mainSource.match(/<h3>キーボード操作<\/h3>[\s\S]*?<\/details>/u)?.[0];

  assert.ok(keyboardSection, 'キーボード操作セクションが見つかりません');
  assert.match(keyboardSection, /キーボードショートカットを有効にする/u);
  assert.doesNotMatch(keyboardSection, /j \/ k \/ r \/ \. \/ g ショートカットを有効にする/u);
  assert.doesNotMatch(keyboardSection, /現在の投稿の枠色/u);
  assert.match(
    keyboardSection,
    /ショートカットキーでキーボードだけでもある程度操作可能にします。詳しくは、<a id="shortcut-key-list-description-link" href="#shortcut-key-list-view">ショートカットキー一覧<\/a>を参照。/u,
  );
  assert.match(mainSource, /function openShortcutKeyListFromSettings\(\): void \{/u);
  assert.match(
    mainSource,
    /shortcutKeyListDescriptionLink\.addEventListener\('click', \(event\) => \{[\s\S]*?openShortcutKeyListFromSettings\(\);/u,
  );
});
