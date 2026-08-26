import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('投稿表示の色に専門的な設定サブセクションを設ける', () => {
  const postColorsSection = mainSource.match(/<h3>投稿表示の色<\/h3>[\s\S]*?<\/details>/u)?.[0];
  assert.ok(postColorsSection, '投稿表示の色セクションが見つかりません');
  assert.match(postColorsSection, /<h4>専門的な設定<\/h4>/u);
  assert.match(postColorsSection, /advanced-post-color-fields/u);
  assert.doesNotMatch(postColorsSection, /highlight-color-controls/u);

  const advancedFields = mainSource.match(/const ADVANCED_POST_COLOR_FIELDS[\s\S]*?\];/u)?.[0];
  assert.ok(advancedFields, '専門的な色設定フィールド定義が見つかりません');
  for (const label of [
    '未読バッジの背景色',
    '未読バッジの文字色',
    '未読投稿の背景色',
    '未読アクセント・境界線の色',
    '投稿区切り線の色',
    'フォーカス中の投稿の枠色',
  ]) {
    assert.match(advancedFields, new RegExp(label, 'u'));
  }
  assert.ok(
    advancedFields.indexOf("key: 'post_border_color'") < advancedFields.indexOf("key: 'current_post_border_color'"),
    'フォーカス中の投稿の枠色は投稿区切り線の色の右に配置してください',
  );
  assert.match(advancedFields, /key: 'current_post_border_color', label: 'フォーカス中の投稿の枠色',[\s\S]*input_id: 'general-current-post-border-color'/u);
  assert.match(mainSource, /wrapper\.className = 'color-setting-item'/u);
  assert.match(mainSource, /picker\.id = `\$\{field\.input_id\}-picker`/u);
  assert.match(mainSource, /text\.id = field\.input_id/u);
  const renderAdvancedColors = mainSource.indexOf('renderColorFields(ADVANCED_POST_COLOR_FIELDS');
  const lookupCurrentBorderColor = mainSource.indexOf("mustElement<HTMLInputElement>('#general-current-post-border-color-picker')");
  assert.ok(
    renderAdvancedColors < lookupCurrentBorderColor,
    '動的に生成する枠色入力は取得処理より先に生成してください',
  );

  const postColorFields = mainSource.match(/const POST_COLOR_FIELDS[\s\S]*?\];/u)?.[0];
  assert.ok(postColorFields, '投稿色フィールド定義が見つかりません');
  assert.doesNotMatch(postColorFields, /unread_badge_background_color|unread_badge_text_color|unread_post_background_color|unread_accent_color|post_border_color/u);
});
