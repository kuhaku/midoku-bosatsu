export type PostContextMenuAction =
  'follow'
  | 'thread'
  | 'tree'
  | 'hide_thread'
  | 'reply_notification'
  | 'save_post';

export type PostContextMenuOptions = {
  has_follow_url: boolean;
  has_thread_url: boolean;
  thread_hiding_enabled: boolean;
  reply_notification_enabled: boolean;
  post_saving_enabled: boolean;
};

export type PostContextMenuItem = 'copy' | PostContextMenuAction;
export type PostContextMenuEntry = PostContextMenuItem | 'separator';

export function postContextMenuActions(options: PostContextMenuOptions): PostContextMenuAction[] {
  const actions: PostContextMenuAction[] = [];
  if (options.has_follow_url) actions.push('follow');
  if (options.has_thread_url) actions.push('thread', 'tree');
  if (options.thread_hiding_enabled && options.has_thread_url) actions.push('hide_thread');
  if (options.reply_notification_enabled) actions.push('reply_notification');
  if (options.post_saving_enabled) actions.push('save_post');
  return actions;
}

export function postContextMenuEntries(options: PostContextMenuOptions): PostContextMenuEntry[] {
  const actions = postContextMenuActions(options);
  const navigationActions = actions.filter((action) => action === 'follow' || action === 'thread' || action === 'tree');
  const optionalActions = actions.filter((action) => action !== 'follow' && action !== 'thread' && action !== 'tree');
  const entries: PostContextMenuEntry[] = ['copy'];
  if (navigationActions.length > 0 || optionalActions.length > 0) entries.push('separator');
  entries.push(...navigationActions);
  if (navigationActions.length > 0 && optionalActions.length > 0) entries.push('separator');
  entries.push(...optionalActions);
  return entries;
}

export function nextPostContextMenuIndex(index: number, delta: -1 | 1, length: number): number {
  if (length <= 0) return -1;
  return (index + delta + length) % length;
}

export function shouldOpenPostContextMenu(pointerOverText: boolean, pointerOverPostUrl = false): boolean {
  return !pointerOverText && !pointerOverPostUrl;
}

type TextRect = { left: number; right: number; top: number; bottom: number };

export function pointerHitsTextRect(x: number, y: number, rects: TextRect[]): boolean {
  return rects.some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
}
