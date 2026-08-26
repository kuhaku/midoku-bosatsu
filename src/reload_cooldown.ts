export const UNREAD_RELOAD_COOLDOWN_MS = 30_000;

export function canStartUnreadReload(
  lastFetchedAtMs: number | null,
  nowMs: number,
  cooldownMs = UNREAD_RELOAD_COOLDOWN_MS,
): boolean {
  return lastFetchedAtMs !== null && nowMs - lastFetchedAtMs >= cooldownMs;
}
