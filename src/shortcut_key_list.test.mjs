import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('キー一覧は保存済み投稿一覧の直下から開けて、Escで閉じられる', () => {
  const navigation = mainSource.match(/<nav class="timeline-navigation"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];

  assert.ok(navigation, '左ナビが見つかりません');
  assert.match(
    navigation,
    /id="saved-posts-button"[\s\S]*?保存済み投稿一覧<\/button>\s*<button id="shortcut-key-list-button"[^>]*>キー一覧<\/button>/u,
  );
  assert.match(mainSource, /id="shortcut-key-list-view"/u);
  assert.match(mainSource, /shortcutKeyListButton\.addEventListener\('click', openShortcutKeyListView\);/u);
  assert.match(mainSource, /event\.key === 'Escape' && !shortcutKeyListView\.hidden[\s\S]*?closeShortcutKeyListView\(\);/u);
  assert.match(mainSource, /shortcutKeyListViewCloseButton\.addEventListener\('click', \(\) => closeShortcutKeyListView\(\)\);/u);
  assert.match(mainSource, /function openShortcutKeyListView\(\): void \{\s*closeBbsActionView\(\);\s*closeSavedPostsView\(\);\s*closeTextSearch\(\);/u);
  assert.match(mainSource, /function closeShortcutKeyListView\(restoreFocus = true\): void \{[\s\S]*?if \(wasOpen && restoreFocus\) shortcutKeyListButton\.focus\(\);/u);
  assert.match(mainSource, /function openSavedPostsView\(\): void \{[\s\S]*?closeShortcutKeyListView\(false\);/u);
  assert.match(mainSource, /function openNewPostView\(\): void \{[\s\S]*?closeShortcutKeyListView\(false\);/u);
  assert.match(mainSource, /async function openBbsActionView[\s\S]*?closeShortcutKeyListView\(false\);/u);
  assert.match(mainSource, /if \(isTextSearchShortcut\(event\) && shortcutKeyListView\.hidden\)/u);
});

test('キー一覧は投稿操作と検索操作を利用者向けに説明する', () => {
  const keyListView = mainSource.match(/<section id="shortcut-key-list-view"[\s\S]*?<\/section>\n\n  <dialog/u)?.[0];

  assert.ok(keyListView, 'キー一覧画面が見つかりません');
  assert.match(keyListView, /一般設定でキーボード操作を有効にしている場合/u);
  const timelineShortcuts = [
    ['j', '上の投稿へ移動'],
    ['k', '下の投稿へ移動'],
    ['.', '未読境界へ移動'],
    ['g', '最新の投稿へ移動'],
    ['n', '新規投稿画面を開く'],
    ['r', '現在の投稿へフォロー投稿'],
    ['t', 'スレッド表示を開く'],
    ['Ctrl + t / Command + t', 'スレッドのツリー表示を開く'],
    ['d', '現在の投稿を保存／解除'],
    ['Ctrl + r / Command + r', '未読リロード'],
    ['Ctrl + b / Command + b', '左ナビを表示／非表示'],
    ['Ctrl + 1〜9 / Command + 1〜9', '登録順のBBS投稿だけを表示'],
    ['Ctrl + 0 / Command + 0', 'すべての掲示板を表示'],
  ];
  const timelineSection = keyListView.match(/<section aria-labelledby="shortcut-key-list-post-navigation-title">([\s\S]*?)<\/section>/u)?.[1];

  assert.ok(timelineSection, '投稿タイムラインのキー一覧が見つかりません');
  assert.deepEqual(
    [...timelineSection.matchAll(/<dt><kbd>([^<]+)<\/kbd><\/dt>/gu)].map((match) => match[1]),
    timelineShortcuts.map(([key]) => key),
  );
  for (const [key, action] of [
    ...timelineShortcuts,
    ['Ctrl + f / Command + f', '投稿内を検索'],
    ['Enter', '次の検索結果'],
    ['Shift + Enter', '前の検索結果'],
    ['Esc', '画面・検索を閉じる'],
  ]) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    assert.match(
      keyListView,
      new RegExp(`<dt><kbd>${escapedKey}<\\/kbd><\\/dt>\\s*<dd>${action}<\\/dd>`, 'u'),
      `キー説明がありません: ${key}：${action}`,
    );
  }
});

test('タイムラインでnキーを押すと新規投稿画面を開く', () => {
  assert.match(
    mainSource,
    /if \(key === 'n'\) \{\s*event\.preventDefault\(\);\s*openNewPostView\(\);\s*return;\s*\}/u,
  );
});

test('タイムラインでtとCommand/Ctrl+t/r/bショートカットを扱える', () => {
  assert.match(
    mainSource,
    /if \(key === 't'\) \{[\s\S]*?openCurrentPostAction\('thread'\)[\s\S]*?return;/u,
  );
  assert.match(
    mainSource,
    /if \(key === 't'\) \{[\s\S]*?openCurrentPostAction\('tree'\)[\s\S]*?return;/u,
  );
  assert.match(
    mainSource,
    /function shouldHandleModifiedNavigationShortcut\(event: KeyboardEvent\): boolean/u,
  );
  assert.match(
    mainSource,
    /if \(key === 'r'\) \{[\s\S]*?reloadButton\.click\(\)[\s\S]*?return;/u,
  );
  assert.match(
    mainSource,
    /if \(key === 'b'\) \{[\s\S]*?toggleTimelineNavigation\(\)[\s\S]*?return;/u,
  );
});

test('キー一覧にCommand/Ctrl+t/r/bの説明がある', () => {
  const keyListView = mainSource.match(/<section id="shortcut-key-list-view"[\s\S]*?<\/section>\n\n  <dialog/u)?.[0];

  assert.ok(keyListView, 'キー一覧画面が見つかりません');
  for (const [key, action] of [
    ['Ctrl + t / Command + t', 'スレッドのツリー表示を開く'],
    ['Ctrl + r / Command + r', '未読リロード'],
    ['Ctrl + b / Command + b', '左ナビを表示／非表示'],
  ]) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const escapedAction = action.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    assert.match(
      keyListView,
      new RegExp(`<dt><kbd>${escapedKey}<\\/kbd><\\/dt>\\s*<dd>${escapedAction}<\\/dd>`, 'u'),
      `キー説明がありません: ${key}：${action}`,
    );
  }
});

test('スレッド／ツリー表示でもj・k・r・dショートカットを扱える', () => {
  assert.match(mainSource, /function actionViewPostElements\(\): HTMLElement\[\]/u);
  assert.match(mainSource, /function buildActionViewPost\(post: ParsedPost, depth = 0\): HTMLElement \{[\s\S]*?article\.dataset\.postKey = postKey\(post\)/u);
  assert.match(mainSource, /buildTreeGroupElement\(group, true\)/u);
  assert.match(mainSource, /function getCurrentShortcutPost\(\): ParsedPost \| undefined/u);
  assert.match(mainSource, /if \(!bbsActionView\.hidden && bbsActionViewPosts\.length === 0\) return false/u);
  assert.match(mainSource, /if \(key === 'j'\) \{[\s\S]*?moveCurrentPost\(1\)/u);
  assert.match(mainSource, /if \(key === 'k'\) \{[\s\S]*?moveCurrentPost\(-1\)/u);
  assert.match(mainSource, /if \(key === 'r'\) \{[\s\S]*?openCurrentPostFollow\(\)/u);
  assert.match(mainSource, /if \(key === 'd'\) \{[\s\S]*?toggleCurrentPostSaved\(\)/u);
});

test('キー一覧は投稿画面での送信ショートカットを説明する', () => {
  const keyListView = mainSource.match(/<section id="shortcut-key-list-view"[\s\S]*?<\/section>\n\n  <dialog/u)?.[0];

  assert.ok(keyListView, 'キー一覧画面が見つかりません');
  const postComposeSection = keyListView.match(/<section aria-labelledby="shortcut-key-list-post-compose-title">([\s\S]*?)<\/section>/u)?.[1];

  assert.ok(postComposeSection, '投稿画面のキー一覧が見つかりません');
  assert.match(postComposeSection, /<h3 id="shortcut-key-list-post-compose-title">投稿画面<\/h3>/u);
  assert.match(
    postComposeSection,
    /<dt><kbd>Ctrl \+ Enter \/ Command \+ Return<\/kbd><\/dt>\s*<dd>投稿を送信<\/dd>/u,
  );
});

test('キー一覧の本文は上下左右に余白を持つ', () => {
  assert.match(
    styleSource,
    /\.shortcut-key-list-view-content\s*\{[^}]*margin:\s*20px/u,
  );
});
