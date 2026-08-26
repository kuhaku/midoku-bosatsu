export type CopiedPostFirstLine = {
  title: string;
  author: string;
  postedAt: string;
  actions: string;
};

export function formatCopiedPostFirstLine({ title, author, postedAt, actions }: CopiedPostFirstLine): string {
  const copiedTitle = title === '＞' ? '＞　' : title;
  return `${copiedTitle} 　投稿者：${author || '　'} 　投稿日：${postedAt}${actions}`;
}
