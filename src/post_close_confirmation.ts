export function shouldRequestPostCloseConfirmation(
  isPostCompose: boolean,
  bodyChanged: boolean,
): boolean {
  return isPostCompose && bodyChanged;
}

export function createPostBodyChangeDetector(
  bodies: ReadonlyArray<{ value: string }>,
): () => boolean {
  const originals = bodies.map((body) => body.value);
  return () => bodies.some((body, index) => body.value !== originals[index]);
}
