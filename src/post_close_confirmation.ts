export function shouldRequestPostCloseConfirmation(
  isPostCompose: boolean,
  confirmOnEscape: boolean,
): boolean {
  return isPostCompose && confirmOnEscape;
}
