import {
  collectKeywordPosts, defaultKeywordTargets, keywordPreviewMatches, keywordUnreadCount,
  parseKeywordStore, migrateLegacyHighlights, keywordHighlightRanges, keywordMatcher, readKeywordPosts, validateKeywordRule,
  type KeywordEntry, type KeywordRule, type KeywordTargets,
} from './keyword_notification.ts';
import type { StoredPost } from './post_log.ts';

const STORAGE_KEY = 'midoku-bosatsu.keyword-notifications.v1';

type Options<T extends StoredPost> = {
  button: HTMLButtonElement;
  getPosts: () => T[];
  visiblePosts: (posts: T[]) => T[];
  isUnread: (post: T) => boolean;
  renderPost: (post: T) => HTMLElement;
  comparePosts: (a: T, b: T) => number;
  markRead: (posts: T[]) => void;
  beforeOpen: () => void;
  rulesChanged: () => void;
  clearPreviews: (root: HTMLElement) => void;
  reportError: (message: string) => void;
};

export function createKeywordNotificationView<T extends StoredPost>(options: Options<T>) {
  let entries: KeywordEntry<T>[] = [];
  let selectedId: string | null = null;
  let migratedHighlights: string[] = [];
  let editorOpen = false;
  let loadFailed = false;
  let loaded = false;
  options.button.disabled = true;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const root = document.createElement('section');
  root.id = 'keyword-notification-view';
  root.className = 'bbs-action-view keyword-notification-view';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="bbs-action-view-shell" role="dialog" aria-modal="true" aria-labelledby="keyword-notification-title">
      <header class="bbs-action-view-header">
        <h2 id="keyword-notification-title">キーワード通知</h2>
        <button type="button" class="icon-button" data-keyword-close>閉じる</button>
      </header>
      <div class="keyword-notification-columns">
        <nav class="keyword-rule-list" aria-label="キーワード検索ルール"></nav>
        <div class="keyword-notification-content bbs-action-view-content"></div>
      </div>
    </div>`;
  const list = root.querySelector<HTMLElement>('.keyword-rule-list')!;
  const content = root.querySelector<HTMLElement>('.keyword-notification-content')!;
  const closeButton = root.querySelector<HTMLButtonElement>('[data-keyword-close]')!;
  const toast = document.createElement('button');
  toast.type = 'button';
  toast.className = 'reply-notification-popup keyword-notification-toast';
  toast.hidden = true;
  toast.setAttribute('aria-live', 'polite');
  document.body.append(root, toast);

  function visibleEntries(): KeywordEntry<T>[] {
    return entries.map(entry => ({ ...entry, posts: options.visiblePosts(entry.posts) as KeywordEntry<T>['posts'] }));
  }
  function persist(next: KeywordEntry<T>[], migrations = migratedHighlights): boolean {
    if (!loaded || loadFailed) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: next, migrated_highlights: migrations }));
      entries = next;
      migratedHighlights = migrations;
      return true;
    } catch (error) {
      options.reportError(`キーワード通知を保存できませんでした: ${String(error)}`);
      return false;
    }
  }
  function clearContent() {
    options.clearPreviews(content);
    content.replaceChildren();
  }
  function button(label: string, action: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }
  function updateCounts() {
    const visible = visibleEntries();
    const total = visible.reduce((sum, entry) => sum + keywordUnreadCount(entry), 0);
    options.button.textContent = total ? `キーワード通知 (${total})` : 'キーワード通知';
    if (!total) toast.hidden = true;
    list.replaceChildren();
    const add = button('+ 通知するキーワードを追加', () => {
      selectedId = null;
      updateCounts();
      renderEditor();
    });
    add.setAttribute('aria-current', selectedId === null ? 'true' : 'false');
    list.append(add);
    for (const entry of visible) {
      const count = keywordUnreadCount(entry);
      const item = button(count ? `${entry.rule.name} (${count})` : entry.rule.name, () => {
        selectedId = entry.rule.id;
        updateCounts();
        renderSelected();
      });
      item.setAttribute('aria-current', selectedId === entry.rule.id ? 'true' : 'false');
      list.append(item);
    }
  }
  function renderEditor(existing?: KeywordEntry<T>) {
    editorOpen = true;
    clearContent();
    const form = document.createElement('form');
    form.className = 'keyword-rule-form';
    form.noValidate = true;
    form.innerHTML = `
      <h3>${existing ? 'キーワード検索ルール編集' : '通知キーワード追加'}</h3>
      <label>キーワード検索ルール名<input name="rule-name" type="text" required autocomplete="off"></label>
      <label>キーワード検索ルール<textarea name="query" rows="3" required spellcheck="false"></textarea></label>
      <label class="keyword-checkbox"><input name="regex" type="checkbox">正規表現を有効にする</label>
      <label class="keyword-checkbox"><input name="ignore-width" type="checkbox">半角/全角を同一視する</label>
      <fieldset><legend>一致したときの動作</legend>
        <label class="keyword-checkbox"><input name="highlight" type="checkbox">一致部分をハイライトする</label>
        <label class="keyword-checkbox"><input name="notify" type="checkbox">一致する投稿を通知する</label>
      </fieldset>
      <fieldset><legend>検索対象</legend>
        <label class="keyword-checkbox"><input name="title" type="checkbox">題名</label>
        <label class="keyword-checkbox"><input name="name" type="checkbox">投稿者名</label>
        <label class="keyword-checkbox"><input name="body" type="checkbox">本文</label>
      </fieldset>
      <p class="keyword-form-help">通常は入力した文字列の部分一致で検索します。選択した対象のいずれかに一致すると、選択した動作を行います。</p>
      <p class="keyword-form-error" role="alert"></p>
      <button type="submit" class="primary-button">保存</button>
      <h3>キーワード検索ルールテスト用プレビュー</h3>
      <label>テスト用文字列<textarea name="test-text" rows="5" spellcheck="false" placeholder="検索ルールを試す文字列を入力してください"></textarea></label>
      <p class="keyword-form-help">入力した文字列の一致部分をハイライト表示します。テスト用文字列は保存されません。</p>
      <p class="keyword-preview-count" role="status"></p>
      <div class="keyword-rule-preview keyword-text-preview" aria-label="一致部分のプレビュー"></div>`;
    content.append(form);
    const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    const defaults = existing?.rule.targets ?? defaultKeywordTargets();
    input('rule-name').value = existing?.rule.name ?? '';
    input('query').value = existing?.rule.query ?? '';
    input('regex').checked = existing?.rule.regex ?? false;
    input('ignore-width').checked = existing?.rule.ignore_width ?? false;
    input('highlight').checked = existing?.rule.highlight ?? false;
    input('notify').checked = existing?.rule.notify ?? true;
    for (const field of ['title', 'name', 'body'] as const) input(field).checked = defaults[field];
    const error = form.querySelector<HTMLElement>('.keyword-form-error')!;
    const preview = form.querySelector<HTMLElement>('.keyword-rule-preview')!;
    const count = form.querySelector<HTMLElement>('.keyword-preview-count')!;
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    function readRule(): KeywordRule {
      return {
        id: existing?.rule.id ?? '', regex_unicode: existing?.rule.regex_unicode, name: input('rule-name').value.trim(), query: input('query').value,
        highlight: input('highlight').checked, notify: input('notify').checked,
        regex: input('regex').checked, ignore_width: input('ignore-width').checked,
        targets: { title: input('title').checked, name: input('name').checked, body: input('body').checked },
      };
    }
    function updatePreview() {
      const rule = readRule();
      // プレビューはルール名未入力でも検索できる。
      const issue = validateKeywordRule({ ...rule, name: rule.name || 'プレビュー' });
      error.textContent = issue ?? '';
      submit.disabled = loadFailed || validateKeywordRule(rule) !== null;
      const text = input('test-text').value;
      preview.replaceChildren();
      if (issue) { preview.textContent = text; count.textContent = ''; return; }
      if (!text) { count.textContent = 'テスト用文字列を入力してください。'; return; }
      const matches = keywordPreviewMatches(rule.query, rule.regex, text, rule.ignore_width, rule.regex_unicode);
      const zeroWidthCount = matches.filter(match => match.start === match.end).length;
      count.textContent = `${matches.length}箇所一致${zeroWidthCount ? `（うち${zeroWidthCount}箇所は文字を含まない一致）` : ''}`;
      let offset = 0;
      for (const match of matches) {
        preview.append(document.createTextNode(text.slice(offset, match.start)));
        if (match.end > match.start) {
          const mark = document.createElement('mark');
          mark.className = 'post-highlight';
          mark.textContent = text.slice(match.start, match.end);
          preview.append(mark);
        }
        offset = match.end;
      }
      preview.append(document.createTextNode(text.slice(offset)));
    }
    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const rule = readRule();
      const issue = validateKeywordRule(rule);
      if (issue || loadFailed) { error.textContent = issue ?? '保存データを読み込めないため追加できません。'; return; }
      if (!rule.id) rule.id = crypto.randomUUID();
      const current = entries.find(entry => entry.rule.id === rule.id);
      const retained = (current?.posts ?? []).filter(keywordMatcher(rule)).map(post => ({ ...post, keyword_unread: rule.notify !== false && post.keyword_unread }));
      const initial = collectKeywordPosts([{ rule, posts: retained }], options.getPosts(), options.isUnread).entries[0];
      const next = existing ? entries.map(entry => entry.rule.id === rule.id ? initial : entry) : [...entries, initial];
      if (!persist(next)) { error.textContent = '保存に失敗しました。入力内容を残しています。'; return; }
      selectedId = rule.id;
      editorOpen = false;
      options.rulesChanged();
      updateCounts();
      renderSelected();
    });
    updatePreview();
    if (loadFailed) error.textContent = '保存データを読み込めないため追加できません。';
    input('rule-name').focus();
  }
  function renderSelected() {
    editorOpen = false;
    if (selectedId === null) return;
    const entry = visibleEntries().find(entry => entry.rule.id === selectedId);
    if (!entry) return;
    if (entry.rule.notify === false) entry.posts = options.getPosts().filter(keywordMatcher(entry.rule)).map(post => ({ ...post, keyword_unread: false }));
    clearContent();
    const header = document.createElement('div');
    header.className = 'keyword-results-header';
    const title = document.createElement('h3');
    title.textContent = entry.rule.name;
    const read = button('表示中の投稿を全て既読にする', () => {
      const ids = new Set(entry.posts.map(post => JSON.stringify([post.site_id, post.id])));
      const next = readKeywordPosts(entries, post => ids.has(JSON.stringify([post.site_id, post.id])));
      if (!persist(next)) return;
      options.markRead(entry.posts);
      updateCounts();
      renderSelected();
    });
    read.disabled = keywordUnreadCount(entry) === 0;
    const remove = button('ルールを削除', () => {
      if (!persist(entries.filter(item => item.rule.id !== entry.rule.id))) return;
      selectedId = entries[0]?.rule.id ?? null;
      options.rulesChanged();
      updateCounts();
      if (selectedId) renderSelected(); else renderEditor();
    });
    const edit = button('ルールを編集', () => renderEditor(entries.find(item => item.rule.id === entry.rule.id)));
    header.append(title, read, edit, remove);
    content.append(header);
    for (const post of entry.posts.slice().sort(options.comparePosts)) {
      const article = options.renderPost(post);
      article.classList.toggle('post-unread', post.keyword_unread);
      article.dataset.unread = String(post.keyword_unread);
      if (post.keyword_unread) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = '未読';
        article.querySelector('.post-meta-primary')?.append(badge);
      }
      content.append(article);
    }
    if (!entry.posts.length) {
      const empty = document.createElement('p');
      empty.className = 'bbs-action-view-message';
      empty.textContent = 'このルールに一致する投稿はありません。';
      content.append(empty);
    }
  }
  function open() {
    if (!loaded) return;
    options.beforeOpen();
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    toast.hidden = true;
    if (selectedId === null && entries.length) selectedId = entries[0].rule.id;
    updateCounts();
    if (selectedId) { renderSelected(); closeButton.focus(); } else renderEditor();
  }
  function close(restoreFocus = false) {
    const wasOpen = !root.hidden;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    clearContent();
    if (restoreFocus && wasOpen) options.button.focus();
  }
  closeButton.addEventListener('click', () => close(true));
  root.addEventListener('click', event => { if (event.target === root) close(true); });
  options.button.addEventListener('click', open);
  toast.addEventListener('click', open);
  return {
    root, content, open, close,
    highlightRanges: (field: keyof KeywordTargets, text: string) => keywordHighlightRanges(entries.map(entry => entry.rule), field, text),
    migrateHighlights(handle: string, body: string) {
      if (!loaded || loadFailed) return;
      try {
        const store = { entries, migrated_highlights: migratedHighlights };
        const next = migrateLegacyHighlights(store, handle, body);
        if (next !== store && persist(next.entries, next.migrated_highlights)) updateCounts();
      } catch (error) { options.reportError(`ハイライト設定を移行できませんでした: ${String(error)}`); }
    },
    isOpen: () => !root.hidden,
    findPost: (key: string) => entries.flatMap(entry => entry.posts).find(post => `${post.site_id}:${post.id}` === key),
    load() {
      try {
        const store = parseKeywordStore<T>(localStorage.getItem(STORAGE_KEY));
        entries = store.entries;
        migratedHighlights = store.migrated_highlights;
      }
      catch (error) { loadFailed = true; options.reportError(`キーワード通知を読み込めませんでした: ${String(error)}`); }
      loaded = true;
      options.button.disabled = false;
      updateCounts();
    },
    sync(posts: T[]) {
      if (!loaded || loadFailed) return;
      const result = collectKeywordPosts(entries, options.visiblePosts(posts), options.isUnread);
      const next = readKeywordPosts(result.entries, post => !options.isUnread(post));
      const changed = next !== entries;
      if (changed && !persist(next)) return;
      updateCounts();
      // 追加フォームは取得・既読更新で再描画しない。
      if (!root.hidden && selectedId !== null && !editorOpen) {
        const scrollTop = content.scrollTop;
        renderSelected();
        content.scrollTop = scrollTop;
      }
      if (result.addedUnread) {
        clearTimeout(toastTimer);
        toast.textContent = `キーワードに一致する新しい投稿があります (${result.addedUnread})`;
        toast.hidden = false;
        toastTimer = setTimeout(() => { toast.hidden = true; }, 8000);
      }
    },
  };
}
