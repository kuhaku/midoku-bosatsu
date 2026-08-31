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

export function buildYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
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
