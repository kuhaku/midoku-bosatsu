export function bindPostEmoticonButton(
  button: HTMLButtonElement,
  body: HTMLTextAreaElement | HTMLInputElement,
  emoticon: string,
): void {
  // ボタンを押した際のフォーカス移動で本文のカーソル位置を失わないようにする。
  button.addEventListener('pointerdown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    const position = body.ownerDocument.activeElement === body
      ? body.selectionStart ?? body.value.length
      : body.value.length;
    body.value = body.value.slice(0, position) + emoticon + body.value.slice(position);
    body.focus();
    body.setSelectionRange(position + emoticon.length, position + emoticon.length);
    body.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
