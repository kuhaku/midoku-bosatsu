export function isReferencePostLink(label: string): boolean {
  return /^\s*参考[：:]/u.test(label);
}
