import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('左ナビに主要操作を指定順で置き、タイムライン見出しは表示しない', () => {
  const navigation = mainSource.match(/<nav[^>]*class="timeline-navigation"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];

  assert.ok(navigation, '左ナビが見つかりません');
  assert.deepEqual(
    [...navigation.matchAll(/<button[^>]*>([^<]+)<\/button>/gu)].map((match) => match[1]),
    ['未読リロード', 'BBS表示切替', '保存済み投稿一覧', 'キー一覧', '新規投稿', '設定'],
  );
  assert.doesNotMatch(navigation, /timeline-unread-jump-button/u);
  assert.doesNotMatch(mainSource, /<h1>未読菩薩<\/h1>/u);
});

test('固定ステータスバーには中央の新規投稿と右端の未読境界ボタンを表示する', () => {
  const fixedStatusActions = mainSource.match(/<div class="fixed-status-actions">([\s\S]*?)<\/div>/u)?.[1];

  assert.ok(fixedStatusActions, '固定ステータスアクションが見つかりません');
  assert.deepEqual(
    [...fixedStatusActions.matchAll(/<button[^>]*>([^<]+)<\/button>/gu)].map((match) => match[1]),
    ['未読境界へ'],
  );
  assert.match(mainSource, /<button id="fixed-new-post-button"[^>]*aria-label="新規投稿"/u);
  assert.doesNotMatch(fixedStatusActions, /保存済み投稿|新規投稿/u);
});

test('固定ステータスバーの未読境界ボタンはジャンプ処理を使う', () => {
  assert.doesNotMatch(mainSource, /timelineUnreadJumpButton/u);
  assert.match(mainSource, /unreadJumpButton\.addEventListener\('click', \(\) => \{\s*jumpToUnreadBoundary\(\);\s*\}\);/u);
});

test('左ナビは追加の余白を置かない', () => {
  const navigation = mainSource.match(/<nav[^>]*class="timeline-navigation"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];

  assert.ok(navigation, '左ナビが見つかりません');
  assert.doesNotMatch(navigation, /timeline-navigation-spacer/u);
  assert.doesNotMatch(styleSource, /\.timeline-navigation-spacer/u);
});

test('左ナビは新規投稿以外のボタンの背景色と枠を表示しない', () => {
  assert.match(
    styleSource,
    /\.timeline-navigation > button:not\(#new-post-button\)\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/u,
  );
});

test('BBS表示切替のメニューは投稿カラムより前面に表示し、切替ボタンはナビの通常ボタンと同じ見た目にする', () => {
  assert.match(
    styleSource,
    /\.timeline-navigation\s*\{[^}]*position:\s*sticky[^}]*z-index:\s*2/u,
  );
  assert.match(
    styleSource,
    /\.bbs-timeline-switcher > button\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/u,
  );
});

test('投稿タイムラインは左ナビ・開閉ボタン・投稿カラムの3列で表示する', () => {
  assert.match(
    styleSource,
    /\.timeline-layout\s*\{[^}]*grid-template-columns:\s*180px\s+auto\s+minmax\(0,\s*1fr\)/u,
  );
  assert.match(styleSource, /\.timeline-navigation\s*\{[^}]*grid-column:\s*1/u);
  assert.match(styleSource, /\.timeline-navigation-toggle\s*\{[^}]*grid-column:\s*2/u);
  assert.match(styleSource, /\.timeline-content\s*\{[^}]*grid-column:\s*3/u);
  assert.match(styleSource, /\.timeline-layout\s*\{[^}]*column-gap:\s*4px/u);
});

test('左ナビを非表示にしたときは開閉ボタンとタイムラインの2列幅を使う', () => {
  assert.match(mainSource, /timelineLayout\.classList\.toggle\('is-navigation-hidden', hidden\)/u);
  assert.match(
    styleSource,
    /\.timeline-layout\.is-navigation-hidden\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/u,
  );
  assert.match(styleSource, /\.timeline-layout\.is-navigation-hidden\s+\.timeline-content\s*\{[^}]*grid-column:\s*2/u);
});

test('左ナビを閉じた後もナビ外の開閉ボタンから再表示できる', () => {
  assert.match(
    mainSource,
    /<button id="timeline-navigation-toggle"[^>]*aria-controls="timeline-navigation"[^>]*aria-expanded="true"[^>]*aria-label="ナビを閉じる"[^>]*title="ナビを閉じる"[^>]*>‹<\/button>/u,
  );
  assert.match(mainSource, /timelineNavigationToggle\.addEventListener\('click', toggleTimelineNavigation\);/u);
  assert.match(
    mainSource,
    /const label = hidden \? 'ナビを開く' : 'ナビを閉じる';\s*for \(const button of \[timelineNavigationToggle, mobileTimelineNavigationToggle\]\) \{\s*button\.setAttribute\('aria-expanded', String\(!hidden\)\);\s*button\.setAttribute\('aria-label', label\);\s*button\.title = label;\s*button\.textContent = hidden \? '›' : '‹';\s*\}/u,
  );
  assert.match(
    styleSource,
    /\.timeline-navigation-toggle\s*\{[^}]*position:\s*sticky/u,
  );
  assert.match(
    styleSource,
    /\.timeline-navigation-toggle\s*\{[^}]*top:\s*0[^}]*align-self:\s*start[^}]*padding-block-start:\s*0[^}]*padding-block-end:\s*100px[^}]*padding-inline:\s*0/u,
  );
});

test('ナビ開閉ボタンは枠線と背景色を表示しない', () => {
  assert.match(
    styleSource,
    /\.timeline-navigation-toggle\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/u,
  );
});

test('1カラム表示では左ナビ由来のボタンを1行に並べる', () => {
  const singleColumnMedia = styleSource.match(/@media \(max-width: 800px\)\s*\{([\s\S]*?)\n\}/u)?.[1];

  assert.ok(singleColumnMedia, '1カラム用のメディアクエリが見つかりません');
  assert.match(
    singleColumnMedia,
    /\.timeline-navigation\s*\{[^}]*grid-template-columns:\s*repeat\(7, max-content\)[^}]*justify-content:\s*start/u,
  );
  assert.match(singleColumnMedia, /\.timeline-navigation button\s*\{[^}]*width:\s*auto/u);
  assert.match(singleColumnMedia, /\.timeline-navigation button\s*\{[^}]*padding-inline:\s*4px/u);
  assert.match(singleColumnMedia, /\.timeline-navigation-toggle\s*\{[^}]*display:\s*none/u);
});

test('モバイル幅では右上の専用ボタンでナビを開閉し、ナビの新規投稿を表示しない', () => {
  const singleColumnMedia = styleSource.match(/@media \(max-width: 800px\)\s*\{([\s\S]*?)\n\}/u)?.[1];

  assert.match(
    mainSource,
    /<button id="mobile-timeline-navigation-toggle" class="mobile-timeline-navigation-toggle"[^>]*aria-controls="timeline-navigation"[^>]*aria-expanded="true"[^>]*aria-label="ナビを閉じる"[^>]*title="ナビを閉じる"[^>]*>‹<\/button>/u,
  );
  assert.match(mainSource, /mobileTimelineNavigationToggle\.addEventListener\('click', toggleTimelineNavigation\);/u);
  assert.match(mainSource, /for \(const button of \[timelineNavigationToggle, mobileTimelineNavigationToggle\]\)/u);
  assert.ok(singleColumnMedia, '1カラム用のメディアクエリが見つかりません');
  assert.match(
    singleColumnMedia,
    /\.mobile-timeline-navigation-toggle\s*\{[^}]*display:\s*block[^}]*position:\s*fixed[^}]*top:\s*12px[^}]*right:\s*12px/u,
  );
  assert.match(singleColumnMedia, /#new-post-button\s*\{[^}]*display:\s*none/u);
  assert.match(singleColumnMedia, /\.text-search-bar\s*\{[^}]*top:\s*64px/u);
});

test('1カラム表示のナビは幅によって2行へ戻さない', () => {
  assert.doesNotMatch(styleSource, /@media \(min-width: 520px\) and \(max-width: 800px\)/u);
});
