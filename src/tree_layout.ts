export type TreeNodePrefixOptions = {
  depth: number;
  ancestorSiblingContinues: readonly boolean[];
  isLastSibling: boolean;
  hasChildren: boolean;
};

export function buildTreeNodePrefixes({
  depth,
  ancestorSiblingContinues,
  isLastSibling,
  hasChildren,
}: TreeNodePrefixOptions): { headerPrefix: string; bodyPrefix: string } {
  const ancestorPrefix = ancestorSiblingContinues.map((continues) => continues ? '│' : '　').join('');
  const headerPrefix = depth === 0 ? '' : `${ancestorPrefix}${isLastSibling ? '└' : '├'}`;
  const bodyPrefix = depth === 0
    ? hasChildren ? '│' : ''
    : `${ancestorPrefix}${isLastSibling ? '　' : '│'}${hasChildren ? '│' : '　'}`;
  return { headerPrefix, bodyPrefix };
}
