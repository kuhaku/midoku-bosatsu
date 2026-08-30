import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src-tauri/src/config.rs', import.meta.url), 'utf8');

test('投稿保存機能の設定を基本的な設定に追加する', () => {
  const timelineSection = mainSource.match(/<h3>基本的な設定<\/h3>[\s\S]*?<\/details>/u)?.[0];
  assert.ok(timelineSection, '基本的な設定セクションが見つかりません');
  assert.match(timelineSection, /投稿保存機能をONにする/u);
  assert.ok(
    timelineSection.indexOf('id="general-max-posts"') < timelineSection.indexOf('id="general-post-saving-enabled"'),
    '投稿保存機能の設定は投稿表示上限数の後に配置してください',
  );
  assert.match(mainSource, /post_saving_enabled: boolean/u);
  assert.match(mainSource, /generalDraftGlobal\.post_saving_enabled = generalPostSavingEnabledInput\.checked/u);
  assert.match(configSource, /post_saving_enabled: bool/u);
});

test('投稿保存機能がOFFのとき保存UIを表示しない', () => {
  assert.match(mainSource, /savedPostsButton\.hidden = !enabled/u);
  assert.match(mainSource, /if \(config\?\.global\.post_saving_enabled \?\? true\) primaryMeta\.append\(createSavePostButton\(post\)\)/u);
  assert.match(mainSource, /if \(config\?\.global\.post_saving_enabled \?\? true\) \{\s*firstLine\.append\(document\.createTextNode\('　'\), createSavePostButton\(post\)\)/u);
  assert.match(mainSource, /if \(config\?\.global\.post_saving_enabled \?\? true\) header\.append\(saveButton\)/u);
});

test('既存設定では投稿保存機能をONとして扱う', () => {
  assert.match(configSource, /#\[serde\(default = "default_true"\)\][\s\S]*?post_saving_enabled: bool/u);
  assert.match(mainSource, /generalPostSavingEnabledInput\.checked = generalDraftGlobal\.post_saving_enabled \?\? true/u);
});
