export type FxTwitterStatusReference = {
  id: string;
  url: string;
};

export type FxTwitterPreview = {
  authorName: string;
  authorHandle: string;
  text: string;
  photoUrls: string[];
};

const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com']);
const FXTWITTER_PREVIEW_TEXT_LIMIT = 140;
const graphemeSegmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const httpUrlPattern = /https?:\/\/[^\s<>"']+/gi;
const trailingUrlPunctuationPattern = /[)\]\}）】」』〉》、。！？,.!?;:…]+$/u;

export type FxTwitterPreviewTextPart = { text: string; url?: string };

export function parseFxTwitterPreviewTextLinks(text: string): FxTwitterPreviewTextPart[] {
  const parts: FxTwitterPreviewTextPart[] = [];
  let lastIndex = 0;
  httpUrlPattern.lastIndex = 0;

  for (const match of text.matchAll(httpUrlPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index) });

    const raw = match[0];
    const trailing = raw.match(trailingUrlPunctuationPattern)?.[0] ?? '';
    const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        parts.push({ text: candidate, url: url.href });
      } else {
        parts.push({ text: candidate });
      }
    } catch {
      parts.push({ text: candidate });
    }
    if (trailing) parts.push({ text: trailing });
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ text }];
}

export function truncateFxTwitterPreviewText(text: string): { text: string; truncated: boolean } {
  const graphemes = Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
  if (graphemes.length <= FXTWITTER_PREVIEW_TEXT_LIMIT) return { text, truncated: false };
  return {
    text: `${graphemes.slice(0, FXTWITTER_PREVIEW_TEXT_LIMIT).join('')}…`,
    truncated: true,
  };
}

export function parseFxTwitterStatusUrl(rawUrl: string): FxTwitterStatusReference | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!X_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const statusIndex = segments.findIndex((segment) => ['status', 'statuses'].includes(segment.toLowerCase()));
  const id = statusIndex >= 0 ? segments[statusIndex + 1] : undefined;
  if (!id || !/^\d+$/.test(id)) return null;

  return { id, url: url.href };
}

export function normalizeFxTwitterPreview(payload: unknown): FxTwitterPreview | null {
  if (!payload || typeof payload !== 'object') return null;
  const status = (payload as { status?: unknown }).status;
  if (!status || typeof status !== 'object') return null;

  const text = (status as { text?: unknown }).text;
  if (typeof text !== 'string' || !text.trim()) return null;

  const author = (status as { author?: unknown }).author;
  const authorName = author && typeof author === 'object' && typeof (author as { name?: unknown }).name === 'string'
    ? (author as { name: string }).name
    : '';
  const authorHandle = author && typeof author === 'object' && typeof (author as { screen_name?: unknown }).screen_name === 'string'
    ? (author as { screen_name: string }).screen_name
    : '';
  const photos = (status as { media?: { photos?: unknown } }).media?.photos;
  const photoUrls = Array.isArray(photos)
    ? photos.flatMap((photo) => photo && typeof photo === 'object' && typeof (photo as { url?: unknown }).url === 'string'
      ? [(photo as { url: string }).url]
      : [])
    : [];

  return { authorName, authorHandle, text, photoUrls };
}
