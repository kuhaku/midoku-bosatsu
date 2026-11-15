type ScreenZoomEvent = Pick<KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'isComposing'>;

export function screenZoomDirection(event: ScreenZoomEvent): -1 | 0 | 1 {
  if (event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return 0;
  if (event.code !== 'Minus' && event.key !== '-' && !(event.shiftKey && event.key === '_')) return 0;
  return event.shiftKey ? 1 : -1;
}

export function nextScreenZoom(current: number, direction: -1 | 1): number {
  return Math.min(2, Math.max(0.5, Math.round((current + direction * 0.1) * 10) / 10));
}

export function createScreenZoomNotice(popup: Pick<HTMLElement, 'textContent' | 'showPopover' | 'hidePopover'>): (scale: number) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (scale) => {
    clearTimeout(timer);
    popup.textContent = `表示倍率：${Math.round(scale * 100)}%`;
    popup.showPopover();
    timer = setTimeout(() => {
      popup.hidePopover();
      timer = undefined;
    }, 2_000);
  };
}
