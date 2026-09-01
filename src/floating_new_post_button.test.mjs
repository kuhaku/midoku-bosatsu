import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('固定バー中央のプラスアイコンから新規投稿画面を開ける', () => {
  assert.match(
    mainSource,
    /<button id="fixed-new-post-button" class="fixed-new-post-button" type="button" aria-label="新規投稿" title="新規投稿"[^>]*>[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?<\/button>/u,
  );
  assert.match(mainSource, /<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"\s*\/>/u);
  assert.match(
    mainSource,
    /const fixedNewPostButton = mustElement<HTMLButtonElement>\('#fixed-new-post-button'\);/u,
  );
  assert.match(
    mainSource,
    /fixedNewPostButton\.addEventListener\('click', \(\) => \{\s*openNewPostView\(\);\s*\}\);/u,
  );
});

test('固定バーは最終取得、新規投稿、未読境界を左右中央へ配置する', () => {
  assert.match(
    mainSource,
    /<div class="fixed-status-main">\s*<div class="fixed-status-metric">[\s\S]*?<button id="fixed-new-post-button"[\s\S]*?<div class="fixed-status-actions">\s*<button id="unread-jump-button"/u,
  );
  assert.match(styleSource, /\.fixed-status-main\s*\{[^}]*grid-template-columns:\s*1fr auto 1fr/u);
  assert.match(styleSource, /\.fixed-status-actions\s*\{[^}]*justify-content:\s*flex-end/u);
});

test('固定バーの新規投稿ボタンは明るい背景に濃いプラスを表示する', () => {
  assert.match(
    styleSource,
    /\.fixed-new-post-button\s*\{[^}]*background:\s*#f8f9fa[^}]*color:\s*#202124/u,
  );
});
