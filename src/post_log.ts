export type StoredPost = {
  id: string;
  site_id: string;
  posted_at: string | null;
  [key: string]: unknown;
};

type PostLogStorage = {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const REQUIRED_STRING_FIELDS = [
  'id',
  'site_id',
  'title',
  'name',
  'email',
  'posted_at_raw',
  'body_html',
  'body_text',
] as const;

const NULLABLE_STRING_FIELDS = [
  'posted_at',
  'follow_url',
  'thread_url',
  'parent_id',
  'thread_id',
] as const;

function isStoredPost(value: unknown): value is StoredPost {
  if (!value || typeof value !== 'object') return false;
  const post = value as Record<string, unknown>;
  return REQUIRED_STRING_FIELDS.every((field) => typeof post[field] === 'string')
    && NULLABLE_STRING_FIELDS.every((field) => typeof post[field] === 'string' || post[field] === null);
}

function timestampOf(post: StoredPost): number {
  if (!post.posted_at) return 0;
  const timestamp = Date.parse(post.posted_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function postKey(post: StoredPost): string {
  return `${post.site_id}:${post.id}`;
}

export function parsePostLog<T extends StoredPost = StoredPost>(raw: string | null): T[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isStoredPost)) return [];
    return parsed as T[];
  } catch {
    return [];
  }
}

export function limitPostLog<T extends StoredPost>(posts: T[], maxPostsBySite: Record<string, number>): T[] {
  const remainingBySite = new Map<string, number>();
  for (const [siteId, maxPosts] of Object.entries(maxPostsBySite)) {
    remainingBySite.set(siteId, Number.isInteger(maxPosts) && maxPosts > 0 ? maxPosts : 1);
  }

  return [...posts]
    .sort((a, b) => {
      const timeDiff = timestampOf(b) - timestampOf(a);
      return timeDiff !== 0 ? timeDiff : postKey(b).localeCompare(postKey(a), 'ja');
    })
    .filter((post) => {
      const remaining = remainingBySite.get(post.site_id) ?? 1;
      if (remaining < 1) return false;
      remainingBySite.set(post.site_id, remaining - 1);
      return true;
    });
}

export function savePostLog<T extends StoredPost>(
  storage: PostLogStorage,
  storageKey: string,
  posts: T[],
  maxPostsBySite: Record<string, number>,
): T[] {
  const limited = limitPostLog(posts, maxPostsBySite);
  storage.setItem(storageKey, JSON.stringify(limited));
  return limited;
}

export function clearPostLog(storage: PostLogStorage, storageKey: string): void {
  storage.removeItem(storageKey);
}
