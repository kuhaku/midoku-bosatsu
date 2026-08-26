type ShortcutTarget = Pick<Element, 'closest'>;

export function isPostNavigationShortcutTarget(target: ShortcutTarget): boolean {
  return Boolean(target.closest('input, textarea, select, a, [contenteditable="true"], [contenteditable=""]'));
}
