export type YouTubeVideoReference = {
  id: string;
  url: string;
};

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const YOUTUBE_SHORT_HOST = 'youtu.be';
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PREVIEW_TITLE_LIMIT = 25;
const graphemeSegmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const halfWidthAsciiPattern = /^[\x00-\x7F]$/u;

export function buildYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function truncateYouTubePreviewTitle(title: string): string {
  const graphemes = Array.from(graphemeSegmenter.segment(title), (segment) => segment.segment);
  let length = 0;
  const visibleGraphemes: string[] = [];
  for (const grapheme of graphemes) {
    const nextLength = length + (halfWidthAsciiPattern.test(grapheme) ? 0.5 : 1);
    if (nextLength > YOUTUBE_PREVIEW_TITLE_LIMIT) {
      return `${visibleGraphemes.join('')}…`;
    }
    visibleGraphemes.push(grapheme);
    length = nextLength;
  }
  return title;
}

export function parseYouTubeVideoUrl(rawUrl: string): YouTubeVideoReference | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === YOUTUBE_SHORT_HOST || host === `www.${YOUTUBE_SHORT_HOST}`) {
    id = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else {
      const [kind, videoId] = url.pathname.split('/').filter(Boolean);
      if (kind === 'shorts' || kind === 'embed') id = videoId ?? null;
    }
  }

  if (!id || !videoIdPattern.test(id)) return null;
  return { id, url: url.href };
}
