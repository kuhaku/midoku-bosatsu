import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFxTwitterPreview,
  parseFxTwitterPreviewTextLinks,
  parseFxTwitterStatusUrl,
  truncateFxTwitterPreviewText,
} from './fxtwitter_preview.ts';

test('X/Twitterのstatus URLだけをFxTwitter API用に識別する', () => {
  assert.deepEqual(
    parseFxTwitterStatusUrl('https://x.com/example/status/1234567890123456789?s=20'),
    { id: '1234567890123456789', url: 'https://x.com/example/status/1234567890123456789?s=20' },
  );
  assert.deepEqual(
    parseFxTwitterStatusUrl('https://mobile.twitter.com/example/status/42/photo/1'),
    { id: '42', url: 'https://mobile.twitter.com/example/status/42/photo/1' },
  );
  assert.deepEqual(
    parseFxTwitterStatusUrl('https://twitter.com/example/statuses/77'),
    { id: '77', url: 'https://twitter.com/example/statuses/77' },
  );
});

test('対象外または投稿IDのないURLはFxTwitterへ送らない', () => {
  assert.equal(parseFxTwitterStatusUrl('https://example.com/example/status/42'), null);
  assert.equal(parseFxTwitterStatusUrl('https://x.com/example'), null);
  assert.equal(parseFxTwitterStatusUrl('https://x.com/example/status/not-a-number'), null);
  assert.equal(parseFxTwitterStatusUrl('not a URL'), null);
});

test('FxTwitterレスポンスからカード表示に必要な安全な値だけを取り出す', () => {
  assert.deepEqual(normalizeFxTwitterPreview({
    code: 200,
    status: {
      text: '画像付きの投稿',
      author: { name: '投稿者', 'screen_name': 'example' },
      media: { photos: [{ url: 'https://pbs.twimg.com/media/example.jpg' }] },
    },
  }), {
    authorName: '投稿者',
    authorHandle: 'example',
    text: '画像付きの投稿',
    photoUrls: ['https://pbs.twimg.com/media/example.jpg'],
  });
});

test('投稿本文がないFxTwitterレスポンスはカードとして扱わない', () => {
  assert.equal(normalizeFxTwitterPreview({ code: 404, status: null }), null);
});

test('X投稿本文は140字まで省略せずに表示する', () => {
  assert.deepEqual(truncateFxTwitterPreviewText('あ'.repeat(140)), {
    text: 'あ'.repeat(140),
    truncated: false,
  });
});

test('X投稿本文は141字以上を末尾の省略記号付きで表示する', () => {
  assert.deepEqual(truncateFxTwitterPreviewText('😀'.repeat(141)), {
    text: `${'😀'.repeat(140)}…`,
    truncated: true,
  });
});

test('X投稿本文のHTTP(S) URLだけをリンク対象として分割する', () => {
  assert.deepEqual(parseFxTwitterPreviewTextLinks('案内 https://example.com/path?q=1。'), [
    { text: '案内 ' },
    { text: 'https://example.com/path?q=1', url: 'https://example.com/path?q=1' },
    { text: '。' },
  ]);
});

test('FxTwitterカードには重複した外部リンクを表示しない', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(main, /Xで開く/u);
});

test('FxTwitterカードの長文はクリックで全文表示を切り替える', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /truncateFxTwitterPreviewText\(preview\.text\)/u);
  assert.match(main, /text\.addEventListener\('click'/u);
  assert.match(main, /text\.setAttribute\('aria-expanded'/u);
});

test('FxTwitterカードはユーザー名と本文URLを外部リンクにする', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /https:\/\/x\.com\/\$\{encodeURIComponent\(preview\.authorHandle\)\}/u);
  assert.match(main, /parseFxTwitterPreviewTextLinks\(value\)/u);
});

test('FxTwitterカードは左に3文字分の余白を置き、下余白を詰める', async () => {
  const { readFile } = await import('node:fs/promises');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const cardRule = style.match(/\.fxtwitter-preview\s*\{[^}]*\}/u)?.[0] ?? '';

  assert.match(cardRule, /margin:\s*10px\s+0\s+2px\s+2em;/u);
});
