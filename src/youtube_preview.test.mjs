import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeVideoUrl } from './youtube_preview.ts';

test('YouTube動画URLから埋め込み対象の動画IDを識別する', () => {
  assert.deepEqual(
    parseYouTubeVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'),
    { id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42' },
  );
  assert.deepEqual(
    parseYouTubeVideoUrl('https://youtu.be/dQw4w9WgXcQ?si=abc'),
    { id: 'dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ?si=abc' },
  );
  assert.deepEqual(
    parseYouTubeVideoUrl('https://m.youtube.com/shorts/dQw4w9WgXcQ'),
    { id: 'dQw4w9WgXcQ', url: 'https://m.youtube.com/shorts/dQw4w9WgXcQ' },
  );
});

test('動画ではないURLや不正な動画IDはYouTubeプレビュー対象にしない', () => {
  assert.equal(parseYouTubeVideoUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYouTubeVideoUrl('https://www.youtube.com/channel/example'), null);
  assert.equal(parseYouTubeVideoUrl('https://youtu.be/not a valid id'), null);
  assert.equal(parseYouTubeVideoUrl('not a URL'), null);
});

test('YouTubeプレビューは設定で無効化でき、初期値はOFFである', async () => {
  const { readFile } = await import('node:fs/promises');
  const [main, globalConfig] = await Promise.all([
    readFile(new URL('./main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src-tauri/resources/global.toml', import.meta.url), 'utf8'),
  ]);

  assert.match(main, /id="general-show-youtube-previews"/u);
  assert.match(main, /show_youtube_previews/u);
  assert.match(main, /appendYouTubePreviews\(body\)/u);
  assert.match(globalConfig, /show_youtube_previews\s*=\s*false/u);
});

test('YouTubeプレビューの下余白を詰める', async () => {
  const { readFile } = await import('node:fs/promises');
  const style = await readFile(new URL('./style.css', import.meta.url), 'utf8');
  const cardRule = style.match(/\.youtube-preview\s*\{[^}]*\}/u)?.[0] ?? '';

  assert.match(cardRule, /margin:\s*10px\s+0\s+2px\s+2em;/u);
});
