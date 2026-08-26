export type ThreadActionKind = 'thread' | 'tree';

export function shouldShowThreadTreeLink(
  treeViewEnabled: boolean,
  threadUrl: string | null | undefined,
  hideTreeLink: boolean,
): boolean {
  return !treeViewEnabled && !hideTreeLink && Boolean(threadUrl?.trim());
}

export function shouldShowThreadHideLink(
  threadUrl: string | null | undefined,
  hideThreadHideLink: boolean,
): boolean {
  return !hideThreadHideLink && Boolean(threadUrl?.trim());
}

export function shouldRenderActionViewAsTree(
  kind: ThreadActionKind,
  treeViewEnabled: boolean,
): boolean {
  return kind === 'tree' || treeViewEnabled;
}
