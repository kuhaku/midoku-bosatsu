import type { Bookmark } from './bookmarks.ts';

export async function loadBookmarkConfig(
  read: () => Promise<Bookmark[] | null>,
  legacy: () => Bookmark[],
  save: (entries: Bookmark[]) => Promise<void>,
): Promise<Bookmark[]> {
  const existing = await read();
  if (existing !== null) return existing;
  const previous = legacy();
  const entries = previous.length ? previous : [{ title: '未読菩薩', url: 'https://github.com/kuhaku/midoku-bosatsu' }];
  await save(entries);
  return entries;
}
