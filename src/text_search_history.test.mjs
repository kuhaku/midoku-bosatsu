import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const textSearchHistory = await import('./text_search_history.ts').catch(() => null);
const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('検索語を最新順で保存し、重複を除いて10件に制限する', () => {
  assert.ok(textSearchHistory, '検索履歴を管理するモジュールが必要です');

  const history = ['十', '九', '八', '七', '六', '五', '四', '三', '二', '一'];
  assert.deepEqual(
    textSearchHistory.recordTextSearchQuery(history, '三'),
    ['三', '十', '九', '八', '七', '六', '五', '四', '二', '一'],
  );
  assert.deepEqual(
    textSearchHistory.recordTextSearchQuery(history, '十一'),
    ['十一', '十', '九', '八', '七', '六', '五', '四', '三', '二'],
  );
});

test('空白だけの検索語は履歴へ保存しない', () => {
  assert.ok(textSearchHistory, '検索履歴を管理するモジュールが必要です');

  assert.deepEqual(
    textSearchHistory.recordTextSearchQuery(['既存'], '   '),
    ['既存'],
  );
});

test('最近の検索メニューは上下キーで先頭・末尾から選択を始め、端で停止する', () => {
  assert.ok(textSearchHistory, '検索履歴を管理するモジュールが必要です');

  const history = ['新しい', '前回', '過去'];
  assert.equal(textSearchHistory.nextTextSearchHistoryIndex(-1, 1, history.length), 0);
  assert.equal(textSearchHistory.nextTextSearchHistoryIndex(-1, -1, history.length), 2);
  assert.equal(textSearchHistory.nextTextSearchHistoryIndex(0, -1, history.length), 0);
  assert.equal(textSearchHistory.nextTextSearchHistoryIndex(2, 1, history.length), 2);
  assert.equal(textSearchHistory.nextTextSearchHistoryIndex(-1, 1, 0), -1);
});

test('検索バーを開くたびに履歴の選択位置をリセットする', () => {
  const openTextSearch = mainSource.match(/function openTextSearch\(\): void \{[\s\S]*?\n\}/u)?.[0];

  assert.ok(openTextSearch, '検索バーを開く処理が必要です');
  assert.match(
    openTextSearch,
    /textSearchHistoryIndex = -1;/u,
  );
});

test('検索欄は最近の検索メニューと履歴消去を表示する', () => {
  assert.match(mainSource, /id="text-search-history-button"/u);
  assert.match(mainSource, /id="text-search-history-menu"/u);
  assert.match(mainSource, /最近の検索を消去/u);
});

test('最近の検索ボタンは文字記号ではなく虫眼鏡SVGを表示する', () => {
  const historyButton = mainSource.match(/<button id="text-search-history-button"[\s\S]*?<\/button>/u)?.[0];

  assert.ok(historyButton, '最近の検索ボタンが必要です');
  assert.match(historyButton, /<svg[^>]*aria-hidden="true"/u);
  assert.match(historyButton, /<circle/u);
  assert.match(historyButton, /<path/u);
  assert.doesNotMatch(historyButton, />⌕</u);
});

test('虫眼鏡ボタンの通常背景は検索バー本体と同じ色にする', () => {
  const searchBar = styleSource.match(/\.text-search-bar\s*\{[^}]*\}/u)?.[0];
  const historyButton = styleSource.match(/\.text-search-history-button\s*\{[^}]*\}/u)?.[0];

  assert.ok(searchBar, '検索バーのスタイルが必要です');
  assert.ok(historyButton, '虫眼鏡ボタンのスタイルが必要です');
  assert.match(searchBar, /background:\s*var\(--color-panel-strong\)/u);
  assert.match(historyButton, /background:\s*var\(--color-panel-strong\)/u);
});
