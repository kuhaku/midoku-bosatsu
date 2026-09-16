import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.parentElement = null;
    this.classList = {
      add: (name) => {
        if (!this.className.split(/\s+/u).includes(name)) this.className = `${this.className} ${name}`.trim();
      },
      contains: (name) => this.className.split(/\s+/u).includes(name),
    };
  }

  append(...children) {
    for (const child of children) child.parentElement = this;
    this.children.push(...children);
  }

  contains(target) {
    return this === target || this.children.some((child) => child.contains?.(target));
  }

  closest(selector) {
    if (selector === '.twitter-card-preview' && this.classList.contains('twitter-card-preview')) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
};

test('通常のHTTP(S)ページだけをTwitter Cardプレビュー対象にする', async () => {
  let previewModule;
  try {
    previewModule = await import('./twitter_card_preview.ts');
  } catch {
    assert.fail('Twitter CardプレビューのURL判定モジュールが必要です');
  }

  const { parseTwitterCardPreviewUrl } = previewModule;
  assert.equal(
    parseTwitterCardPreviewUrl('https://example.com/articles/42?from=bbs'),
    'https://example.com/articles/42?from=bbs',
  );
  assert.equal(parseTwitterCardPreviewUrl('http://example.com/'), 'http://example.com/');
});

test('X、YouTube、画像・動画直リンクはTwitter Cardプレビュー対象にしない', async () => {
  const { parseTwitterCardPreviewUrl } = await import('./twitter_card_preview.ts');

  for (const url of [
    'https://x.com/example/status/123',
    'https://mobile.twitter.com/example/status/123',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://example.com/photo.JPG?size=large',
    'https://example.com/movie.webm#player',
    'ftp://example.com/article',
    'not a URL',
  ]) {
    assert.equal(parseTwitterCardPreviewUrl(url), null, url);
  }
});

test('Twitter Cardプレビューは一般設定で無効化でき、初期値はOFFである', async () => {
  const [main, globalConfig, rustConfig, rustLib] = await Promise.all([
    readFile(new URL('./main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/resources/global.toml', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/src/config.rs', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8'),
  ]);

  assert.match(main, /id="general-show-twitter-card-previews"/u);
  assert.match(main, /show_twitter_card_previews: boolean;/u);
  assert.match(main, /appendTwitterCardPreviews\(body\)/u);
  assert.match(main, /invoke<TwitterCardPreview \| null>\('fetch_twitter_card_preview', \{ url \}\)/u);
  assert.match(globalConfig, /show_twitter_card_previews\s*=\s*false/u);
  assert.match(rustConfig, /pub show_twitter_card_previews: bool,/u);
  assert.match(rustLib, /fetch_twitter_card_preview/u);
});

test('Twitter Cardはリンク先、タイトル、説明、画像を安全なDOM APIで表示する', async () => {
  const { buildTwitterCardPreview } = await import('./twitter_card_preview.ts');
  const card = buildTwitterCardPreview({
    url: 'https://example.com/article',
    title: '<b>Article title</b>',
    description: '<script>Description</script>',
    image_url: 'data:image/png;base64,AAAA',
    site_name: 'Example',
  }, false, fakeDocument);
  const descendants = collectDescendants(card);

  assert.equal(card.className, 'twitter-card-preview post-copy-exclusion');
  assert.equal(descendants.find((element) => element.className === 'twitter-card-preview-title')?.textContent, '<b>Article title</b>');
  assert.equal(descendants.find((element) => element.className === 'twitter-card-preview-description')?.textContent, '<script>Description</script>');
  assert.equal(descendants.find((element) => element.className === 'twitter-card-preview-image')?.src, 'data:image/png;base64,AAAA');
  assert.ok(descendants.some((element) => element.tagName === 'A' && element.dataset.externalUrl === 'https://example.com/article'));
});

test('Twitter Cardのdescriptionはリンクの外にプレーンテキストで表示する', async () => {
  const { buildTwitterCardPreview } = await import('./twitter_card_preview.ts');
  const card = buildTwitterCardPreview({
    url: 'https://example.com/article',
    title: 'Article title',
    description: 'Description with https://example.net/ URL',
    image_url: 'data:image/png;base64,AAAA',
    site_name: 'Example',
  }, false, fakeDocument);

  const descendants = collectDescendants(card);
  const links = descendants.filter((child) => child.tagName === 'A');
  const description = descendants.find((child) => child.className === 'twitter-card-preview-description');

  assert.equal(card.tagName, 'DIV');
  assert.ok(description);
  assert.equal(description.textContent, 'Description with https://example.net/ URL');
  assert.ok(links.every((link) => !link.contains(description)));
});

test('Twitter Cardのサイト名はリンクの外にプレーンテキストで表示する', async () => {
  const { buildTwitterCardPreview } = await import('./twitter_card_preview.ts');
  const card = buildTwitterCardPreview({
    url: 'https://example.com/article',
    title: 'Article title',
    description: 'Description',
    image_url: 'data:image/png;base64,AAAA',
    site_name: 'Example News',
  }, false, fakeDocument);

  const descendants = collectDescendants(card);
  const links = descendants.filter((element) => element.tagName === 'A');
  const siteName = descendants.find((element) => element.className === 'twitter-card-preview-site');
  const title = descendants.find((element) => element.className === 'twitter-card-preview-title');

  assert.ok(siteName);
  assert.equal(siteName.textContent, 'Example News');
  assert.ok(links.every((link) => !link.contains(siteName)));
  assert.ok(links.some((link) => link.contains(title)));
});

test('Twitter Cardの画像または見出しを開くと親カードを訪問済みにする', async () => {
  const { buildTwitterCardPreview, markTwitterCardPreviewVisited } = await import('./twitter_card_preview.ts');

  for (const linkClass of ['twitter-card-preview-image-link', 'twitter-card-preview-heading-link']) {
    const card = buildTwitterCardPreview({
      url: 'https://example.com/article',
      title: 'Article title',
      description: 'Description',
      image_url: 'data:image/png;base64,AAAA',
      site_name: 'Example',
    }, false, fakeDocument);
    const link = collectDescendants(card).find((element) => element.className === linkClass);

    assert.ok(link);
    markTwitterCardPreviewVisited(link);
    assert.equal(card.classList.contains('link-visited'), true);
  }
});

function collectDescendants(element) {
  return element.children.flatMap((child) => [child, ...collectDescendants(child)]);
}

test('画像のないTwitter Cardはテキストをカード全幅に表示する', async () => {
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(
    style,
    /\.twitter-card-preview-content:first-child\s*\{\s*grid-column:\s*1\s*\/\s*-1;\s*\}/u,
  );
});

test('Twitter Cardプレビューの下側は投稿本文と近接させる', async () => {
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');

  assert.match(
    style,
    /\.twitter-card-preview\s*\{[^}]*margin:\s*10px\s+0\s+0\s+2em;/u,
  );
});

test('投稿本文の元リンクだけをTwitter Card候補にして生成UIリンクを除外する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const appendTwitterCards = main.match(
    /function appendTwitterCardPreviews\(body: HTMLElement\): void \{[\s\S]*?\n\}\n\nconst droppedHtmlTags/u,
  )?.[0] ?? '';

  assert.match(main, /link\.dataset\.twitterCardPreviewCandidate = 'true';/u);
  assert.match(main, /element\.dataset\.twitterCardPreviewCandidate = 'true';/u);
  assert.match(appendTwitterCards, /a\[data-twitter-card-preview-candidate="true"\]/u);
  assert.doesNotMatch(appendTwitterCards, /a\[data-external-url\]/u);
});

test('Twitter Card取得は同時実行数を制限し、成功結果だけを上限付きでキャッシュする', async () => {
  const { createTwitterCardPreviewLoader } = await import('./twitter_card_preview.ts');
  assert.equal(typeof createTwitterCardPreviewLoader, 'function');

  const pending = [];
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const loader = createTwitterCardPreviewLoader((url) => new Promise((resolve) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    pending.push(() => {
      active -= 1;
      resolve({ url, title: url, description: '', image_url: '', site_name: '' });
    });
  }), 2, 2);

  const first = loader('https://example.com/1');
  const duplicate = loader('https://example.com/1');
  const second = loader('https://example.com/2');
  const third = loader('https://example.com/3');
  assert.equal(calls, 2);
  pending.shift()();
  await first;
  assert.equal(await duplicate, await first);
  assert.equal(calls, 3);
  pending.shift()();
  pending.shift()();
  await Promise.all([second, third]);
  assert.equal(maxActive, 2);

  const retried = loader('https://example.com/1');
  assert.equal(calls, 4, '最古の成功キャッシュは上限超過時に破棄する');
  pending.shift()();
  await retried;
});

test('取得に失敗したTwitter Cardは再試行できる', async () => {
  const { createTwitterCardPreviewLoader } = await import('./twitter_card_preview.ts');
  let calls = 0;
  const loader = createTwitterCardPreviewLoader(async () => {
    calls += 1;
    return null;
  });

  assert.equal(await loader('https://example.com/retry'), null);
  assert.equal(await loader('https://example.com/retry'), null);
  assert.equal(calls, 2);
});

test('Twitter Card取得の待機数が上限に達したら追加要求を捨てる', async () => {
  const { createTwitterCardPreviewLoader } = await import('./twitter_card_preview.ts');
  let calls = 0;
  const loader = createTwitterCardPreviewLoader(() => {
    calls += 1;
    return new Promise(() => {});
  }, 1, 2, 2);

  void loader('https://example.com/1');
  void loader('https://example.com/2');
  assert.equal(await Promise.race([
    loader('https://example.com/3'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 20)),
  ]), null);
  assert.equal(calls, 1);
});

test('Twitter Cardは表示領域へ近づいてから取得を開始する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const appendTwitterCards = main.match(
    /function appendTwitterCardPreviews\(body: HTMLElement\): void \{[\s\S]*?\n\}\n\nconst droppedHtmlTags/u,
  )?.[0] ?? '';

  assert.match(main, /new IntersectionObserver/u);
  assert.match(appendTwitterCards, /observeTwitterCardPreview\(loading,/u);
});

test('タイムライン再描画時に古いTwitter Cardの表示監視を解除する', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const cleanup = main.match(
    /function clearObservedTwitterCardPreviews\(root: Node\): void \{[\s\S]*?\n\}/u,
  )?.[0] ?? '';

  assert.match(main, /twitterCardPreviewObserver\?\.unobserve\(element\)/u);
  assert.match(cleanup, /observedTwitterCardPreviews\.delete\(element\)/u);
  assert.doesNotMatch(cleanup, /observedTwitterCardPreviews\.clear\(\)/u);
  for (const root of ['postsElement', 'savedPostsViewContent', 'bbsActionViewContent']) {
    assert.match(
      main,
      new RegExp(`clearObservedTwitterCardPreviews\\(${root}\\);\\s*${root}\\.replaceChildren`, 'u'),
      root,
    );
  }
});
