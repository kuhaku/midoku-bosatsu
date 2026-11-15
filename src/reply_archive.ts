import { parsePostLog, type StoredPost } from './post_log.ts';

export type ArchivedReply<T extends StoredPost> = T & { reply_unread: boolean };
export type ReplyArchive<T extends StoredPost> = { posts: ArchivedReply<T>[]; deleted: string[] };
const keyOf = (post: { site_id: string; id: string }): string => JSON.stringify([post.site_id, post.id]);

export function parseReplyArchive<T extends StoredPost>(raw: string | null): ReplyArchive<T> {
  if (!raw) return { posts: [], deleted: [] };
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.posts) || !Array.isArray(parsed.deleted)
      || !parsed.deleted.every((key: unknown) => typeof key === 'string')) {
    throw new Error('レス一覧の保存データが不正です');
  }
  const posts = parsePostLog<ArchivedReply<T>>(JSON.stringify(parsed.posts));
  if (posts.length !== parsed.posts.length || !posts.every(post => typeof post.reply_unread === 'boolean')) {
    throw new Error('レス一覧の投稿データが不正です');
  }
  return { posts, deleted: parsed.deleted };
}

export function addArchivedReplies<T extends StoredPost>(
  state: ReplyArchive<T>, posts: T[], isUnread: (post: T) => boolean,
): ReplyArchive<T> {
  const known = new Set([...state.deleted, ...state.posts.map(keyOf)]);
  const added: ArchivedReply<T>[] = [];
  for (const post of posts) {
    const key = keyOf(post);
    if (known.has(key)) continue;
    known.add(key);
    added.push({ ...post, reply_unread: isUnread(post) });
  }
  return added.length ? { ...state, posts: [...state.posts, ...added] } : state;
}

export function readArchivedReplies<T extends StoredPost>(state: ReplyArchive<T>, posts: T[]): ReplyArchive<T> {
  const keys = new Set(posts.map(keyOf));
  if (!state.posts.some(post => post.reply_unread && keys.has(keyOf(post)))) return state;
  return { ...state, posts: state.posts.map(post => keys.has(keyOf(post)) ? { ...post, reply_unread: false } : post) };
}

export function deleteArchivedReply<T extends StoredPost>(state: ReplyArchive<T>, post: T): ReplyArchive<T> {
  const key = keyOf(post);
  return { posts: state.posts.filter(entry => keyOf(entry) !== key), deleted: [...new Set([...state.deleted, key])] };
}
