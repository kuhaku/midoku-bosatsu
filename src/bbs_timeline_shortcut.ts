type BbsSite = { id: string };

export function bbsTimelineSelectionForShortcutKey(
  sites: BbsSite[],
  key: string,
): string | null | undefined {
  if (key === '0') return null;
  if (!/^[1-9]$/u.test(key)) return undefined;
  return sites[Number(key) - 1]?.id;
}

export function filterPostsForBbsTimeline<T extends { site_id: string }>(
  posts: T[],
  selectedSiteId: string | null,
): T[] {
  return selectedSiteId === null ? posts : posts.filter((post) => post.site_id === selectedSiteId);
}
