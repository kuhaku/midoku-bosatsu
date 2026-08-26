export type ThreadVisibilityPost = {
  site_id: string;
  id: string;
  thread_id: string | null;
};

export function threadVisibilityKey(post: ThreadVisibilityPost): string {
  const threadId = post.thread_id?.trim() || post.id.trim();
  return `${post.site_id}:${threadId}`;
}

export function filterHiddenThreadPosts<T extends ThreadVisibilityPost>(
  posts: T[],
  hiddenThreadKeys: ReadonlySet<string>,
): T[] {
  return posts.filter((post) => !hiddenThreadKeys.has(threadVisibilityKey(post)));
}
