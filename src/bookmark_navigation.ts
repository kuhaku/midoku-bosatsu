import { confirm } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { loadBookmarkConfig } from './bookmark_config.ts';
import { addBookmark, loadBookmarks, removeBookmark, type Bookmark } from './bookmarks.ts';

export function setupBookmarkNavigation(root: HTMLElement, openUrl: (url: string) => Promise<void>, reportError: (message: string) => void): { reload: () => Promise<void> } {
  root.innerHTML = `
    <button id="bookmark-toggle" type="button" aria-expanded="false" aria-controls="bookmark-menu" title="ブックマーク">ブックマーク</button>
    <div id="bookmark-menu" class="bookmark-menu" hidden>
      <div class="bookmark-items"></div>
      <button class="bookmark-add" type="button">リンクを追加</button>
    </div>
    <dialog class="bookmark-dialog" aria-labelledby="bookmark-dialog-title">
      <form>
        <h2 id="bookmark-dialog-title">リンクを追加</h2>
        <label>タイトル<input name="title" required autocomplete="off"></label>
        <label>URL<input name="url" type="url" required placeholder="https://" spellcheck="false"></label>
        <p class="bookmark-error" role="alert" hidden></p>
        <div class="bookmark-actions">
          <button class="bookmark-cancel" type="button">キャンセル</button>
          <button class="primary-button" type="submit">追加</button>
        </div>
      </form>
    </dialog>`;
  const toggle = root.querySelector<HTMLButtonElement>('#bookmark-toggle')!;
  const menu = root.querySelector<HTMLElement>('#bookmark-menu')!;
  const items = root.querySelector<HTMLElement>('.bookmark-items')!;
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const title = form.elements.namedItem('title') as HTMLInputElement;
  const url = form.elements.namedItem('url') as HTMLInputElement;
  const error = root.querySelector<HTMLElement>('.bookmark-error')!;
  let entries: Bookmark[] = [];
  let busy = false;
  const addButton = root.querySelector<HTMLButtonElement>('.bookmark-add')!;
  const submitButton = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const saveEntries = (bookmarks: Bookmark[]) => invoke<void>('save_bookmarks', { bookmarks });
  const storage = { setItem: (_key: string, value: string) => saveEntries(JSON.parse(value) as Bookmark[]) };
  function setBusy(value: boolean): void {
    busy = value;
    addButton.disabled = value;
    submitButton.disabled = value;
    items.querySelectorAll<HTMLButtonElement>('.bookmark-remove').forEach(button => { button.disabled = value; });
  }
  function render(): void {
    items.replaceChildren(...entries.map((entry) => {
      const row = document.createElement('div');
      row.className = 'bookmark-item';
      const button = document.createElement('button');
      button.className = 'bookmark-link';
      button.type = 'button';
      button.textContent = entry.title;
      button.title = entry.url;
      button.addEventListener('click', () => {
        void openUrl(entry.url).catch((e: unknown) => reportError(`リンクを開けませんでした: ${String(e)}`));
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bookmark-remove';
      remove.textContent = '×';
      remove.title = `「${entry.title}」を削除`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try {
          const approved = await confirm(`「${entry.title}」をブックマークから削除しますか？`, {
            title: 'ブックマークの削除',
            kind: 'warning',
            okLabel: '削除',
            cancelLabel: 'キャンセル',
          });
          if (!approved) return;
          entries = await removeBookmark(storage, entries, entry);
          render();
        } catch (e) {
          reportError(`ブックマークを削除できませんでした: ${String(e)}`);
        } finally {
          setBusy(false);
          if (!remove.isConnected) addButton.focus();
        }
      });
      row.append(button, remove);
      return row;
    }));
  }
  toggle.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
  });
  root.querySelector('.bookmark-add')!.addEventListener('click', () => {
    form.reset();
    error.hidden = true;
    dialog.showModal();
    title.focus();
  });
  root.querySelector('.bookmark-cancel')!.addEventListener('click', () => dialog.close());
  // 入力中のキー操作を背後のタイムラインへ渡さない。Escはdialog標準動作で閉じる。
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      entries = await addBookmark(storage, entries, title.value, url.value);
    } catch (e) {
      error.textContent = `リンクを追加できませんでした: ${e instanceof Error ? e.message : String(e)}`;
      error.hidden = false;
      return;
    } finally {
      setBusy(false);
    }
    render();
    dialog.close();
  });
  async function reload(): Promise<void> {
    setBusy(true);
    await loadBookmarkConfig(
      () => invoke<Bookmark[] | null>('load_bookmarks'),
      () => loadBookmarks(localStorage),
      saveEntries,
    ).then((loaded) => {
      entries = loaded;
      render();
      setBusy(false);
    }).catch((e: unknown) => {
      // 読み込み失敗時は追加・削除を禁止し、既存ファイルの上書きを防ぐ。
      reportError(`ブックマーク設定を読み込めませんでした: ${String(e)}`);
    });
  }
  void reload();
  return { reload };
}
