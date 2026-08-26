import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const textSearchScope = await import('./text_search_scope.ts').catch(() => null);
const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('保存済み投稿一覧が開いているときはその一覧を検索対象にする', () => {
  assert.ok(textSearchScope, '検索対象を選択するモジュールが必要です');

  const timeline = { hidden: false };
  const savedPostsView = { hidden: false };
  const savedPostsContent = { hidden: false };

  assert.equal(
    textSearchScope.textSearchRoot(timeline, savedPostsView, savedPostsContent),
    savedPostsContent,
  );
});

test('保存済み投稿一覧が閉じているときは投稿タイムラインを検索対象にする', () => {
  assert.ok(textSearchScope, '検索対象を選択するモジュールが必要です');

  const timeline = { hidden: false };
  const savedPostsView = { hidden: true };
  const savedPostsContent = { hidden: false };

  assert.equal(
    textSearchScope.textSearchRoot(timeline, savedPostsView, savedPostsContent),
    timeline,
  );
});

test('保存済み投稿一覧での検索バーはオーバーレイより前面に表示する', () => {
  assert.match(
    mainSource,
    /textSearchBar\.classList\.toggle\('is-over-saved-posts-view', !savedPostsView\.hidden\);/u,
  );
  assert.match(
    styleSource,
    /\.text-search-bar\.is-over-saved-posts-view\s*\{[^}]*z-index:\s*1600/u,
  );
});
