import { parsePostLog, type StoredPost } from './post_log.ts';

export type SavedPost<T extends StoredPost = StoredPost> = T & {
  saved_at: string;
  saved_tree_key?: string;
};

type SavedPostStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function isSavedPost<T extends StoredPost>(value: unknown): value is SavedPost<T> {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as Record<string, unknown>).saved_at === 'string'
    && ((value as Record<string, unknown>).saved_tree_key === undefined
      || typeof (value as Record<string, unknown>).saved_tree_key === 'string'),
  );
}

function savedAtTimestamp<T extends StoredPost>(post: SavedPost<T>): number {
  const timestamp = Date.parse(post.saved_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function keyOf(post: SavedPost | StoredPost): string {
  return `${post.site_id}:${post.id}`;
}

function sortSavedPosts<T extends StoredPost>(posts: SavedPost<T>[]): SavedPost<T>[] {
  return [...posts].sort((left, right) => {
    const timeDifference = savedAtTimestamp(right) - savedAtTimestamp(left);
    return timeDifference !== 0 ? timeDifference : keyOf(right).localeCompare(keyOf(left), 'ja');
  });
}

export function parseSavedPosts<T extends StoredPost = StoredPost>(raw: string | null): SavedPost<T>[] {
  const parsedPosts = parsePostLog<SavedPost<T>>(raw);
  if (!parsedPosts.every(isSavedPost<T>)) return [];
  return sortSavedPosts(parsedPosts);
}

export function savePost<T extends StoredPost>(
  storage: SavedPostStorage,
  storageKey: string,
  post: T,
  savedAt: string,
): SavedPost<T>[] {
  const entry: SavedPost<T> = { ...post, saved_at: savedAt };
  const entries = [
    ...parseSavedPosts<T>(storage.getItem(storageKey)).filter((savedPost) => keyOf(savedPost) !== keyOf(post)),
    entry,
  ];
  const sorted = sortSavedPosts(entries);
  storage.setItem(storageKey, JSON.stringify(sorted));
  return sorted;
}

export function savePosts<T extends StoredPost>(
  storage: SavedPostStorage,
  storageKey: string,
  posts: Iterable<T>,
  savedAt: string,
): SavedPost<T>[] {
  let entries = parseSavedPosts<T>(storage.getItem(storageKey));
  for (const post of posts) {
    const entry: SavedPost<T> = { ...post, saved_at: savedAt };
    entries = [...entries.filter((savedPost) => keyOf(savedPost) !== keyOf(post)), entry];
  }
  const sorted = sortSavedPosts(entries);
  storage.setItem(storageKey, JSON.stringify(sorted));
  return sorted;
}

export function saveTreePosts<T extends StoredPost>(
  storage: SavedPostStorage,
  storageKey: string,
  posts: Iterable<T>,
  treeKey: string,
  savedAt: string,
): SavedPost<T>[] {
  let entries = parseSavedPosts<T>(storage.getItem(storageKey));
  for (const post of posts) {
    const entry: SavedPost<T> = { ...post, saved_at: savedAt, saved_tree_key: treeKey };
    entries = [...entries.filter((savedPost) => keyOf(savedPost) !== keyOf(post)), entry];
  }
  const sorted = sortSavedPosts(entries);
  storage.setItem(storageKey, JSON.stringify(sorted));
  return sorted;
}

export function removeSavedPost<T extends StoredPost = StoredPost>(
  storage: SavedPostStorage,
  storageKey: string,
  siteId: string,
  postId: string,
): SavedPost<T>[] {
  const entries = parseSavedPosts<T>(storage.getItem(storageKey))
    .filter((post) => post.site_id !== siteId || post.id !== postId);
  storage.setItem(storageKey, JSON.stringify(entries));
  return entries;
}

export function removePosts<T extends StoredPost>(
  storage: SavedPostStorage,
  storageKey: string,
  posts: Iterable<T>,
): SavedPost<T>[] {
  const keys = new Set<string>();
  for (const post of posts) keys.add(keyOf(post));
  const entries = parseSavedPosts<T>(storage.getItem(storageKey))
    .filter((post) => !keys.has(keyOf(post)));
  storage.setItem(storageKey, JSON.stringify(entries));
  return entries;
}

export function hasSavedPost<T extends StoredPost>(posts: SavedPost<T>[], siteId: string, postId: string): boolean {
  return posts.some((post) => post.site_id === siteId && post.id === postId);
}

export function arePostsSaved<T extends StoredPost>(savedPosts: SavedPost<T>[], posts: Iterable<T>): boolean {
  let hasPost = false;
  for (const post of posts) {
    hasPost = true;
    if (!hasSavedPost(savedPosts, post.site_id, post.id)) return false;
  }
  return hasPost;
}

export function savedTreeGroups<T extends StoredPost>(posts: SavedPost<T>[]): SavedPost<T>[][] {
  const groups = new Map<string, SavedPost<T>[]>();
  for (const post of posts) {
    const treeKey = post.saved_tree_key?.trim();
    if (!treeKey) continue;
    const group = groups.get(treeKey);
    if (group) group.push(post);
    else groups.set(treeKey, [post]);
  }
  return [...groups.values()];
}
