import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('左ナビに主要操作を指定順で置き、タイムライン見出しは表示しない', () => {
  const navigation = mainSource.match(/<nav class="timeline-navigation"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];

  assert.ok(navigation, '左ナビが見つかりません');
  assert.deepEqual(
    [...navigation.matchAll(/<button[^>]*>([^<]+)<\/button>/gu)].map((match) => match[1]),
    ['未読リロード', '未読境界へ', 'BBS表示切替', '保存済み投稿一覧', 'キー一覧', '新規投稿', '設定'],
  );
  assert.match(navigation, /id="timeline-unread-jump-button"/u);
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

test('左ナビと固定ステータスバーの未読境界ボタンは同じジャンプ処理を使う', () => {
  assert.match(mainSource, /timelineUnreadJumpButton\.addEventListener\('click', \(\) => \{\s*jumpToUnreadBoundary\(\);\s*\}\);/u);
  assert.match(mainSource, /unreadJumpButton\.addEventListener\('click', \(\) => \{\s*jumpToUnreadBoundary\(\);\s*\}\);/u);
});

test('左ナビは追加の余白を置かない', () => {
  const navigation = mainSource.match(/<nav class="timeline-navigation"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];

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

test('左ナビを非表示にしたときタイムラインは1列幅を使う', () => {
  assert.match(mainSource, /timelineLayout\.classList\.toggle\('is-navigation-hidden', hidden\)/u);
  assert.match(
    styleSource,
    /\.timeline-layout\.is-navigation-hidden\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
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
});

test('1カラム表示のナビは幅によって2行へ戻さない', () => {
  assert.doesNotMatch(styleSource, /@media \(min-width: 520px\) and \(max-width: 800px\)/u);
});
