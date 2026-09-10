export function isShortcutKeyListNavigationVisible(keyboardShortcutsEnabled: boolean | undefined): boolean {
  return keyboardShortcutsEnabled ?? true;
}
