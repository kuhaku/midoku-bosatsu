type SearchRoot = {
  hidden: boolean;
};

export function textSearchRoot<T extends SearchRoot>(
  timeline: T,
  savedPostsView: SearchRoot,
  savedPostsContent: T,
): T {
  return savedPostsView.hidden ? timeline : savedPostsContent;
}
