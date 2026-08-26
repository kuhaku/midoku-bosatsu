import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('一般設定の画像項目を画像表示セクションにまとめる', () => {
  const imageSection = mainSource.match(/<details class="settings-section(?: [^"]+)?">\s*<summary class="settings-section-heading">[\s\S]*?<h3>画像表示<\/h3>[\s\S]*?<\/details>/u)?.[0];

  assert.ok(imageSection, '画像表示セクションが見つかりません');
  assert.match(imageSection, /<h3>画像表示<\/h3>/u);
  assert.match(imageSection, /投稿内画像を表示する/u);
  assert.match(imageSection, /詳希\(;ﾟДﾟ\)/u);
  assert.match(imageSection, /画像サムネイル最大高 \(px\)/u);
  assert.match(imageSection, /ホバー画像サイズ \(ウィンドウ比 %\)/u);
  assert.match(imageSection, /id="general-image-size-settings"/u);
  assert.match(mainSource, /generalImageSizeSettings\.hidden\s*=\s*!generalShowImagesInput\.checked/u);
  assert.match(styleSource, /#general-image-size-settings\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/u);

  const timelineSection = mainSource.match(/<h3>基本的な設定<\/h3>[\s\S]*?<\/details>/u)?.[0];
  assert.ok(timelineSection, '投稿表示セクションが見つかりません');
  assert.doesNotMatch(timelineSection, /general-show-images|general-show-image-detail|general-image-max-height|general-image-hover-window-percent/u);
});
