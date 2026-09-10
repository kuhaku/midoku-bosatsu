export const TEXT_SEARCH_HISTORY_LIMIT = 10;

export function recordTextSearchQuery(history: string[], query: string): string[] {
  if (!query.trim()) return history;

  return [query, ...history.filter((item) => item !== query)]
    .slice(0, TEXT_SEARCH_HISTORY_LIMIT);
}

export function parseTextSearchHistory(raw: string | null): string[] {
  if (!raw) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .reduceRight<string[]>(
      (history, query) => recordTextSearchQuery(history, query),
      [],
    );
}

export function nextTextSearchHistoryIndex(currentIndex: number, delta: number, length: number): number {
  if (length === 0) return -1;
  if (currentIndex < 0) return delta > 0 ? 0 : length - 1;
  return Math.max(0, Math.min(currentIndex + delta, length - 1));
}
