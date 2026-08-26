export type PostSubmitShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>;

export function isPostSubmitShortcut(event: PostSubmitShortcutEvent, platform: string): boolean {
  if (event.key !== 'Enter') return false;
  return platform.startsWith('Mac') ? event.metaKey : event.ctrlKey;
}
