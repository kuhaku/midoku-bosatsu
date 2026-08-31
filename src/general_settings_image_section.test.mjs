import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('一般設定のメディア表示を画像表示とSNS表示に分ける', () => {
  const mediaSection = mainSource.match(/<details class="settings-section general-image-display-section">[\s\S]*?<\/details>/u)?.[0];

  assert.ok(mediaSection, 'メディア表示セクションが見つかりません');
  assert.match(mediaSection, /<h3>メディア表示<\/h3>/u);

  const imageSubsection = mediaSection.match(/<section class="settings-subsection[^"]*">[\s\S]*?<h4>画像表示<\/h4>[\s\S]*?<\/section>/u)?.[0];
  assert.ok(imageSubsection, '画像表示サブセクションが見つかりません');
  assert.match(imageSubsection, /画像リンクをプレビュー表示する/u);
  assert.match(imageSubsection, /詳希\(;ﾟДﾟ\)/u);
  assert.match(imageSubsection, /画像サムネイル最大高 \(px\)/u);
  assert.match(imageSubsection, /ホバー画像サイズ \(ウィンドウ比 %\)/u);
  assert.match(imageSubsection, /id="general-image-size-settings"/u);

  const snsSubsection = mediaSection.match(/<section class="settings-subsection[^"]*">[\s\S]*?<h4>SNS表示<\/h4>[\s\S]*?<\/section>/u)?.[0];
  assert.ok(snsSubsection, 'SNS表示サブセクションが見つかりません');
  assert.match(snsSubsection, /Twitter \(X\) のリンクをプレビュー表示する/u);
  assert.match(snsSubsection, /YouTubeリンクをプレビュー表示する/u);

  assert.match(mainSource, /generalImageSizeSettings\.hidden\s*=\s*!generalShowImagesInput\.checked/u);
  assert.match(styleSource, /#general-image-size-settings\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/u);

  const timelineSection = mainSource.match(/<h3>基本的な設定<\/h3>[\s\S]*?<\/details>/u)?.[0];
  assert.ok(timelineSection, '投稿表示セクションが見つかりません');
  assert.doesNotMatch(timelineSection, /general-show-images|general-show-image-detail|general-image-max-height|general-image-hover-window-percent/u);
});
