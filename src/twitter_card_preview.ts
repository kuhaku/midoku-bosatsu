export type TwitterCardPreview = {
  url: string;
  title: string;
  description: string;
  image_url: string;
  site_name: string;
};

type TwitterCardDocument = Pick<Document, 'createElement'>;

function configurePreviewLink(link: HTMLAnchorElement, url: string): void {
  link.href = url;
  link.dataset.externalUrl = url;
  link.rel = 'noopener noreferrer';
  link.title = url;
}

export function markTwitterCardPreviewVisited(element: Element): void {
  element.closest('.twitter-card-preview')?.classList.add('link-visited');
}

export function buildTwitterCardPreview(
  preview: TwitterCardPreview,
  visited = false,
  documentRef: TwitterCardDocument = document,
): HTMLElement {
  const card = documentRef.createElement('div');
  card.className = 'twitter-card-preview post-copy-exclusion';
  if (visited) card.classList.add('link-visited');

  if (preview.image_url) {
    const imageLink = documentRef.createElement('a');
    imageLink.className = 'twitter-card-preview-image-link';
    configurePreviewLink(imageLink, preview.url);

    const image = documentRef.createElement('img');
    image.className = 'twitter-card-preview-image';
    image.src = preview.image_url;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    imageLink.append(image);
    card.append(imageLink);
  }

  const content = documentRef.createElement('span');
  content.className = 'twitter-card-preview-content';
  if (preview.site_name) {
    const siteName = documentRef.createElement('span');
    siteName.className = 'twitter-card-preview-site';
    siteName.textContent = preview.site_name;
    content.append(siteName);
  }
  if (preview.title) {
    const headingLink = documentRef.createElement('a');
    headingLink.className = 'twitter-card-preview-heading-link';
    configurePreviewLink(headingLink, preview.url);

    const title = documentRef.createElement('strong');
    title.className = 'twitter-card-preview-title';
    title.textContent = preview.title;
    headingLink.append(title);
    content.append(headingLink);
  }
  if (preview.description) {
    const description = documentRef.createElement('span');
    description.className = 'twitter-card-preview-description';
    description.textContent = preview.description;
    content.append(description);
  }
  card.append(content);
  return card;
}

export function createTwitterCardPreviewLoader(
  fetchPreview: (url: string) => Promise<TwitterCardPreview | null>,
  concurrency = 4,
  maxCacheEntries = 200,
  maxPendingRequests = 200,
): (url: string) => Promise<TwitterCardPreview | null> {
  type QueueEntry = {
    url: string;
    resolve: (preview: TwitterCardPreview | null) => void;
  };

  const queue: QueueEntry[] = [];
  const inFlight = new Map<string, Promise<TwitterCardPreview | null>>();
  const cache = new Map<string, TwitterCardPreview>();
  const limit = Math.max(1, Math.floor(concurrency));
  const cacheLimit = Math.max(0, Math.floor(maxCacheEntries));
  const pendingLimit = Math.max(1, Math.floor(maxPendingRequests));
  let active = 0;

  const drain = (): void => {
    while (active < limit && queue.length > 0) {
      const entry = queue.shift();
      if (!entry) return;
      active += 1;
      void fetchPreview(entry.url)
        .then((preview) => preview?.image_url ? preview : null)
        .catch(() => null)
        .then((preview) => {
          if (preview && cacheLimit > 0) {
            cache.set(entry.url, preview);
            while (cache.size > cacheLimit) {
              const oldest = cache.keys().next().value as string | undefined;
              if (oldest === undefined) break;
              cache.delete(oldest);
            }
          }
          inFlight.delete(entry.url);
          active -= 1;
          entry.resolve(preview);
          drain();
        });
    }
  };

  return (url: string): Promise<TwitterCardPreview | null> => {
    const cached = cache.get(url);
    if (cached) {
      cache.delete(url);
      cache.set(url, cached);
      return Promise.resolve(cached);
    }
    const pending = inFlight.get(url);
    if (pending) return pending;
    if (inFlight.size >= pendingLimit) return Promise.resolve(null);

    const request = new Promise<TwitterCardPreview | null>((resolve) => {
      queue.push({ url, resolve });
    });
    inFlight.set(url, request);
    drain();
    return request;
  };
}

const excludedHosts = [
  'x.com',
  'twitter.com',
  'youtube.com',
  'youtube-nocookie.com',
  'youtu.be',
];

const mediaPathPattern = /\.(?:3g2|3gp|apng|avif|avi|bmp|flv|gif|heic|heif|ico|jfif|jpe?g|m2ts|m4v|mkv|mov|mp4|mpe?g|ogv|png|svg|tiff?|ts|webm|webp|wmv)$/i;

function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function parseTwitterCardPreviewUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (excludedHosts.some((domain) => isHostOrSubdomain(host, domain))) return null;
  if (mediaPathPattern.test(url.pathname)) return null;
  return url.href;
}
