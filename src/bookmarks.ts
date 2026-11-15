export interface Bookmark {
  title: string;
  url: string;
}

const STORAGE_KEY = 'midoku-bosatsu.bookmarks.v1';

function bookmark(title: string, url: string): Bookmark {
  title = title.trim();
  url = url.trim();
  if (!title) throw new Error('タイトルを入力してください。');
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error();
  } catch {
    throw new Error('URLをHTTP(S) URLで入力してください。');
  }
  return { title, url };
}

export function loadBookmarks(storage: Pick<Storage, 'getItem'>): Bookmark[] {
  const raw = storage.getItem(STORAGE_KEY);
  let entries: unknown;
  try { entries = JSON.parse(raw ?? '[]'); } catch { return []; }
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (!entry || typeof entry.title !== 'string' || typeof entry.url !== 'string') return [];
    try { return [bookmark(entry.title, entry.url)]; } catch { return []; }
  });
}

type BookmarkStorage = { setItem(key: string, value: string): void | Promise<void> };

export async function addBookmark(storage: BookmarkStorage, entries: Bookmark[], title: string, url: string): Promise<Bookmark[]> {
  const next = [...entries, bookmark(title, url)];
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function removeBookmark(storage: BookmarkStorage, entries: Bookmark[], target: Bookmark): Promise<Bookmark[]> {
  const next = entries.filter((entry) => entry !== target);
  await storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
