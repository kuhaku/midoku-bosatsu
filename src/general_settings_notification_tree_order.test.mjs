import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('ハイライトの次にレス通知、その次にツリー表示を配置する', () => {
  const mainSource = read('./main.ts');
  const styleSource = read('./style.css');
  const generalSettings = mainSource.match(/<section id="general-settings-dialog"[\s\S]*?<section id="bbs-settings-dialog"/u)?.[0];

  assert.ok(generalSettings, '一般設定の範囲が見つかりません');
  assert.match(generalSettings, /<h3>レス通知<\/h3>/u);
  assert.doesNotMatch(generalSettings, /<h3>返信通知<\/h3>/u);
  assert.match(generalSettings, /id="general-reply-notification-options"/u);
  assert.match(mainSource, /generalReplyNotificationOptions\.hidden\s*=\s*!generalReplyNotificationEnabledInput\.checked/u);
  assert.match(styleSource, /#general-reply-notification-options\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/u);
  assert.match(styleSource, /\.general-highlight-section\s*\{[\s\S]*?order:\s*5/u);
  assert.match(styleSource, /\.general-reply-notification-section\s*\{[\s\S]*?order:\s*6/u);
  assert.match(styleSource, /\.general-tree-section\s*\{[\s\S]*?order:\s*7/u);
});
