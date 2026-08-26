import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('./style.css', import.meta.url), 'utf8');

test('スレッド非表示後に取り消し可能なトーストを表示する', () => {
  assert.match(mainSource, /id="thread-hide-undo-toast"/u);
  assert.match(mainSource, /投稿を非表示にしました/u);
  assert.match(mainSource, />戻す<\/button>/u);
  assert.match(mainSource, /function showThreadHideUndoToast\([\s\S]*?threadHideUndoToast\.hidden = false/u);
});

test('戻すは今回非表示にしたスレッドだけを永続非表示から解除して再表示する', () => {
  assert.match(mainSource, /function undoThreadHide\([\s\S]*?invoke\('remove_hidden_threads', \{ targets: \[thread\] \}\)/u);
  assert.match(mainSource, /function undoThreadHide\([\s\S]*?await refreshHiddenThreadKeys\(\);[\s\S]*?renderPosts\(\);/u);
});

test('非表示トーストは一定時間後に自動で閉じる', () => {
  assert.match(mainSource, /window\.setTimeout\([\s\S]*?threadHideUndoToast\.hidden = true/u);
  assert.match(styleSource, /\.thread-hide-undo-toast\s*\{[^}]*position:\s*fixed/u);
  assert.match(styleSource, /\.thread-hide-undo-toast\[hidden\]\s*\{\s*display:\s*none !important;/u);
});

test('非表示トーストは指定の背景色・枠色・太さを使う', () => {
  const toastStyle = styleSource.match(/\.thread-hide-undo-toast\s*\{[\s\S]*?\n\}/u)?.[0];
  assert.ok(toastStyle, '非表示トーストのスタイルが見つかりません');
  assert.match(toastStyle, /border:\s*2px solid #ea4335;/u);
  assert.match(toastStyle, /background:\s*#004040;/u);
});

test('レス通知中は非表示取り消しトーストをその上へ移動する', () => {
  const renderBanner = mainSource.match(/function renderReplyNotificationBanner\(\): void \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(renderBanner, 'レス通知トーストの描画処理が見つかりません');
  assert.match(renderBanner, /threadHideUndoToast\.classList\.toggle\('is-above-reply-notification', hasUnreadReply\)/u);
  assert.match(styleSource, /\.thread-hide-undo-toast\.is-above-reply-notification\s*\{[^}]*bottom:\s*calc\(var\(--fixed-status-bar-height\) \+ 92px\);/u);
});
