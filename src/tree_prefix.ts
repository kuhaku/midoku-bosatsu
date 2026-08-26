export function buildTreeBodyPrefix(bodyPrefix: string): string {
  const treeIndent = bodyPrefix.replace(/｜/gu, '│');
  return treeIndent ? `　${treeIndent}` : '　　';
}
