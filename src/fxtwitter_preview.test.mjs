import test from 'node:test';
import assert from 'node:assert/strict';
import * as fxTwitterPreviewModule from './fxtwitter_preview.ts';
import {
  normalizeFxTwitterPreview,
  parseFxTwitterPreviewTextLinks,
  parseFxTwitterStatusUrl,
  renderFxTwitterCommunityNote,
  selectFxTwitterPreviewText,
  truncateFxTwitterPreviewText,
} from './fxtwitter_preview.ts';

test('FxTwitterの青色の個人認証だけを青バッジとして正規化する', () => {
  const normalizeVerification = (verification) => normalizeFxTwitterPreview({
    status: {
      id: '123',
      url: 'https://x.com/example/status/123',
      text: '投稿',
      author: { name: '投稿者', screen_name: 'example', verification },
    },
  })?.authorIsBlueVerified;

  assert.equal(normalizeVerification({ verified: true, type: 'individual' }), true);
  assert.equal(normalizeVerification({ verified: true, type: 'organization' }), undefined);
  assert.equal(normalizeVerification({ verified: true, type: 'government' }), undefined);
  assert.equal(normalizeVerification({ verified: false, type: 'individual' }), undefined);
  assert.equal(normalizeVerification('invalid'), undefined);
});

test('青バッジユーザーは表示名、青バッジ、ハンドルの順にヘッダーへ追加する', () => {
  const children = [];
  const documentRef = {
    createElement: () => ({
      className: '',
      textContent: '',
      title: '',
      attributes: new Map(),
      setAttribute(name, value) {
        this.attributes.set(name, value);
      },
    }),
  };
  const container = { append: (child) => children.push(child) };
  const author = { kind: 'author' };
  const translationLink = { kind: 'translation' };

  fxTwitterPreviewModule.appendFxTwitterAuthorHeader(
    { authorHandle: 'example', authorIsBlueVerified: true },
    container,
    author,
    translationLink,
    documentRef,
  );

  assert.equal(children.length, 4);
  assert.equal(children[0], author);
  assert.equal(children[1].className, 'fxtwitter-preview-blue-badge');
  assert.equal(children[1].textContent, '●');
  assert.equal(children[1].title, '青バッジ');
  assert.equal(children[1].attributes.get('role'), 'img');
  assert.equal(children[1].attributes.get('aria-label'), '青バッジ');
  assert.equal(children[2].textContent, '@example');
  assert.equal(children[3], translationLink);
});

test('青バッジユーザーでなければ表示名とハンドルの間にバッジを追加しない', () => {
  const children = [];
  const documentRef = {
    createElement: () => ({ className: '', textContent: '' }),
  };
  const container = { append: (child) => children.push(child) };
  const author = { kind: 'author' };

  fxTwitterPreviewModule.appendFxTwitterAuthorHeader(
    { authorHandle: 'example' },
    container,
    author,
    undefined,
    documentRef,
  );

  assert.equal(children.length, 2);
  assert.equal(children[0], author);
  assert.equal(children[1].textContent, '@example');
});

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
      url: 'https://x.com/example/status/1234567890',
      text: '画像と動画付きの投稿',
      author: { name: '投稿者', 'screen_name': 'example' },
      media: {
        photos: [{ url: 'https://pbs.twimg.com/media/example.jpg' }],
        videos: [{
          url: 'https://video.twimg.com/ext_tw_video/example.mp4',
          thumbnail_url: 'https://pbs.twimg.com/tweet_video_thumb/example.jpg',
        }],
      },
    },
  }), {
    authorName: '投稿者',
    authorHandle: 'example',
    statusUrl: 'https://x.com/example/status/1234567890',
    statusId: '1234567890',
    text: '画像と動画付きの投稿',
    translatedText: '',
    photoUrls: ['https://pbs.twimg.com/media/example.jpg'],
    videos: [{
      url: 'https://video.twimg.com/ext_tw_video/example.mp4',
      thumbnailUrl: 'https://pbs.twimg.com/tweet_video_thumb/example.jpg',
    }],
  });
});

test('投稿本文がないFxTwitterレスポンスはカードとして扱わない', () => {
  assert.equal(normalizeFxTwitterPreview({ code: 404, status: null }), null);
});

test('本文がなくても写真または動画があるX投稿はカードとして扱う', () => {
  const mediaCases = [
    {
      media: { photos: [{ url: 'https://pbs.twimg.com/media/example.jpg' }] },
      expectedPhotoUrls: ['https://pbs.twimg.com/media/example.jpg'],
      expectedVideos: [],
    },
    {
      media: {
        videos: [{
          url: 'https://video.twimg.com/ext_tw_video/example.mp4',
          thumbnail_url: 'https://pbs.twimg.com/tweet_video_thumb/example.jpg',
        }],
      },
      expectedPhotoUrls: [],
      expectedVideos: [{
        url: 'https://video.twimg.com/ext_tw_video/example.mp4',
        thumbnailUrl: 'https://pbs.twimg.com/tweet_video_thumb/example.jpg',
      }],
    },
  ];

  for (const { media, expectedPhotoUrls, expectedVideos } of mediaCases) {
    const preview = normalizeFxTwitterPreview({
      status: {
        id: '2101297340271530173',
        url: 'https://x.com/example/status/2101297340271530173',
        text: '',
        author: { name: '投稿者', screen_name: 'example' },
        media,
      },
    });

    assert.ok(preview);
    assert.equal(preview.text, '');
    assert.deepEqual(preview.photoUrls, expectedPhotoUrls);
    assert.deepEqual(preview.videos, expectedVideos);
  }
});

test('本文・写真・動画がすべてないX投稿はカードとして扱わない', () => {
  assert.equal(normalizeFxTwitterPreview({
    status: {
      id: '123',
      url: 'https://x.com/example/status/123',
      text: '',
      media: { photos: [], videos: [] },
    },
  }), null);
});

test('FxTwitterレスポンスの翻訳文と引用先ポストをカード用に正規化する', () => {
  assert.deepEqual(normalizeFxTwitterPreview({
    status: {
      url: 'https://x.com/example/status/123',
      text: 'Original post',
      translation: { text: '翻訳された投稿' },
      author: { name: '投稿者', screen_name: 'example' },
      quote: {
        url: 'https://x.com/quoted/status/456',
        text: 'Quoted post',
        translation: { text: '引用先の翻訳' },
        author: {
          name: '引用先',
          screen_name: 'quoted',
          verification: { verified: true, type: 'individual' },
        },
      },
    },
  }), {
    authorName: '投稿者',
    authorHandle: 'example',
    statusUrl: 'https://x.com/example/status/123',
    statusId: '123',
    text: 'Original post',
    translatedText: '翻訳された投稿',
    photoUrls: [],
    videos: [],
    quote: {
      authorName: '引用先',
      authorHandle: 'quoted',
      authorIsBlueVerified: true,
      statusUrl: 'https://x.com/quoted/status/456',
      text: 'Quoted post',
      translatedText: '引用先の翻訳',
      photoUrls: [],
      videos: [],
    },
  });
});

test('FxTwitterレスポンスのコミュニティノートと出典リンクを安全に正規化する', () => {
  assert.deepEqual(normalizeFxTwitterPreview({
    status: {
      url: 'https://x.com/example/status/123',
      text: 'Original post',
      author: { name: '投稿者', screen_name: 'example' },
      community_note: {
        text: '誤りです。出典と危険',
        facets: [
          {
            type: 'url',
            indices: [5, 7],
            replacement: 'https://example.com/source',
            display: '資料',
          },
          {
            type: 'url',
            indices: [8, 10],
            replacement: 'javascript:alert(1)',
            display: '危険',
          },
        ],
      },
      quote: {
        url: 'https://x.com/quoted/status/456',
        text: 'Quoted post',
        author: { name: '引用先', screen_name: 'quoted' },
        community_note: {
          text: '引用先への注記',
          facets: [],
        },
      },
    },
  }), {
    authorName: '投稿者',
    authorHandle: 'example',
    statusUrl: 'https://x.com/example/status/123',
    statusId: '123',
    text: 'Original post',
    translatedText: '',
    photoUrls: [],
    videos: [],
    communityNote: {
      parts: [
        { text: '誤りです。' },
        { text: '資料', url: 'https://example.com/source' },
        { text: 'と危険' },
      ],
    },
    quote: {
      authorName: '引用先',
      authorHandle: 'quoted',
      statusUrl: 'https://x.com/quoted/status/456',
      text: 'Quoted post',
      translatedText: '',
      photoUrls: [],
      videos: [],
      communityNote: {
        parts: [{ text: '引用先への注記' }],
      },
    },
  });
});

test('本文が空または不正なコミュニティノートは表示対象にしない', () => {
  const preview = normalizeFxTwitterPreview({
    status: {
      url: 'https://x.com/example/status/123',
      text: 'Original post',
      community_note: { text: '   ', facets: [] },
    },
  });

  assert.ok(preview);
  assert.equal(preview.communityNote, undefined);
});

test('コミュニティノートは本文と出典リンクの順序を保って描画する', () => {
  const operations = [];

  renderFxTwitterCommunityNote({
    parts: [
      { text: '背景情報は' },
      { text: '公式資料', url: 'https://example.com/source' },
      { text: 'を参照。' },
    ],
  }, {
    appendText: (text) => operations.push({ type: 'text', text }),
    appendLink: (url, text) => operations.push({ type: 'link', url, text }),
  });

  assert.deepEqual(operations, [
    { type: 'text', text: '背景情報は' },
    { type: 'link', url: 'https://example.com/source', text: '公式資料' },
    { type: 'text', text: 'を参照。' },
  ]);
});

test('翻訳文がある場合だけプレビュー本文を翻訳文へ切り替える', () => {
  const preview = {
    authorName: '', authorHandle: '', statusUrl: '', text: 'Original', translatedText: '翻訳', photoUrls: [], videos: [],
  };
  assert.equal(selectFxTwitterPreviewText(preview, false), 'Original');
  assert.equal(selectFxTwitterPreviewText(preview, true), '翻訳');
  assert.equal(selectFxTwitterPreviewText({ ...preview, translatedText: '' }, true), 'Original');
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

  assert.match(main, /truncateFxTwitterPreviewText\(previewText\)/u);
  assert.match(main, /text\.addEventListener\('click'/u);
  assert.match(main, /text\.setAttribute\('aria-expanded'/u);
});

test('FxTwitterカードは翻訳と原文を切り替え、引用先ポストを埋め込む', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /fetchFxTwitterPreview\(preview\.statusId, 'ja'\)/u);
  assert.match(main, /translationLink\.textContent = translated \? '原文' : '翻訳'/u);
  assert.match(main, /preview\.quote/u);
  assert.match(main, /fxtwitter-preview-quote/u);
});

test('Xの動画サムネイルはリンクへのホバー時だけ画像を少し暗くする', async () => {
  const { readFile } = await import('node:fs/promises');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const hoverRule = style.match(/\.fxtwitter-preview-video-link:hover\s+\.fxtwitter-preview-video-thumbnail\s*\{[^}]*\}/u)?.[0] ?? '';

  assert.match(hoverRule, /filter:\s*brightness\(85%\);/u);
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

test('FxTwitter動画サムネイルは共通サイズを高さの上限に使う', async () => {
  const { readFile } = await import('node:fs/promises');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const videoRule = style.match(/\.fxtwitter-preview-video-thumbnail\s*\{[^}]*\}/u)?.[0] ?? '';

  assert.match(videoRule, /max-height:\s*var\(--fxtwitter-video-thumbnail-size-px\);/u);
  assert.doesNotMatch(videoRule, /reader-image-max-height/u);
});

test('FxTwitterメディアのサムネイルは直接URLを新しいタブで開く', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(main, /createExternalLink\(imageUrl, ''\)/u);
  assert.match(main, /createExternalLink\(videoUrl, ''\)/u);
  assert.match(main, /mediaLink\.target = '_blank'/u);
});

test('FxTwitterのサムネイル枠はリンクの未訪問・訪問済み色を使う', async () => {
  const { readFile } = await import('node:fs/promises');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const photoRule = style.match(/\.fxtwitter-preview-photo\s*\{[^}]*\}/u)?.[0] ?? '';
  const videoLinkRule = style.match(/\.fxtwitter-preview-video-link\s*\{[^}]*\}/u)?.[0] ?? '';

  assert.match(photoRule, /border:\s*1px\s+solid\s+var\(--post-link-unvisited-color\);/u);
  assert.match(videoLinkRule, /border:\s*1px\s+solid\s+var\(--post-link-unvisited-color\);/u);
  assert.match(style, /\.fxtwitter-preview-photo\.link-visited\s*\{[^}]*border-color:\s*var\(--post-link-visited-color\);/u);
  assert.match(style, /\.fxtwitter-preview-video-link\.link-visited\s*\{[^}]*border-color:\s*var\(--post-link-visited-color\);/u);
});
