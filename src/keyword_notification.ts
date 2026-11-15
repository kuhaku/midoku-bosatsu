import { normalizeKeywordWidth, normalizeKeywordPattern, keywordWidthMap } from './keyword_width.ts';
import { parsePostLog, type StoredPost } from './post_log.ts';

export type KeywordTargets = { title: boolean; name: boolean; body: boolean };
export type KeywordRule = { id: string; name: string; shortcut?: string; query: string; regex: boolean; ignore_width?: boolean; highlight?: boolean; notify?: boolean; regex_unicode?: boolean; targets: KeywordTargets };
export type KeywordEntry<T extends StoredPost> = { rule: KeywordRule; posts: Array<T & { keyword_unread: boolean }> };

export function defaultKeywordTargets(): KeywordTargets {
  return { title: false, name: false, body: true };
}

export function validateKeywordRule(rule: KeywordRule, rules: KeywordRule[] = []): string | null {
  if (rule.shortcut !== undefined && (typeof rule.shortcut !== 'string' || !/^[0-9]?$/u.test(rule.shortcut))) return 'ショートカットは0〜9または割り当てなしを指定してください。';
  if (rule.shortcut && rules.some(other => other.id !== rule.id && other.shortcut === rule.shortcut)) return 'このショートカットは他のルールで使用中です。';
  if (!rule.name.trim()) return 'キーワード検索ルール名を入力してください。';
  if (!rule.query.trim()) return 'キーワード検索ルールを入力してください。';
  if (!(rule.targets.title || rule.targets.name || rule.targets.body)) return '検索対象を1つ以上選択してください。';
  if (rule.regex) {
    try { new RegExp(rule.ignore_width ? normalizeKeywordPattern(rule.query) : rule.query, rule.regex_unicode ? 'u' : ''); } catch { return '正規表現が不正です。入力を確認してください。'; }
  }
  return null;
}

export function keywordMatcher(rule: KeywordRule): (post: StoredPost) => boolean {
  const query = rule.ignore_width ? (rule.regex ? normalizeKeywordPattern(rule.query) : normalizeKeywordWidth(rule.query)) : rule.query;
  const expression = rule.regex ? new RegExp(query, rule.regex_unicode ? 'u' : '') : null;
  const fields = [rule.targets.title ? 'title' : '', rule.targets.name ? 'name' : '', rule.targets.body ? 'body_text' : ''].filter(Boolean);
  return post => fields.some(field => {
    const text = typeof post[field] === 'string' ? post[field] as string : '';
    const target = rule.ignore_width ? normalizeKeywordWidth(text) : text;
    return expression ? expression.test(target) : target.includes(query);
  });
}

export function keywordUnreadCount<T extends StoredPost>(entry: KeywordEntry<T>): number {
  return entry.rule.notify === false ? 0 : entry.posts.filter(post => post.keyword_unread).length;
}

export function collectKeywordPosts<T extends StoredPost>(
  entries: KeywordEntry<T>[], posts: T[], isUnread: (post: T) => boolean,
): { entries: KeywordEntry<T>[]; addedUnread: number } {
  let changed = false;
  let addedUnread = 0;
  const next = entries.map(entry => {
    if (entry.rule.notify === false) return entry;
    const match = keywordMatcher(entry.rule);
    const key = (post: T) => JSON.stringify([post.site_id, post.id]);
    const known = new Set(entry.posts.map(key));
    const added: KeywordEntry<T>['posts'] = [];
    for (const post of posts) {
      if (known.has(key(post)) || !match(post)) continue;
      known.add(key(post));
      const unread = isUnread(post);
      added.push({ ...post, keyword_unread: unread });
      if (unread) addedUnread++;
    }
    if (!added.length) return entry;
    changed = true;
    return { ...entry, posts: [...entry.posts, ...added] };
  });
  return { entries: changed ? next : entries, addedUnread };
}

export function readKeywordPosts<T extends StoredPost>(
  entries: KeywordEntry<T>[], shouldRead: (post: T, ruleId: string) => boolean,
): KeywordEntry<T>[] {
  let changed = false;
  const next = entries.map(entry => {
    if (!entry.posts.some(post => post.keyword_unread && shouldRead(post, entry.rule.id))) return entry;
    changed = true;
    return { ...entry, posts: entry.posts.map(post => post.keyword_unread && shouldRead(post, entry.rule.id)
      ? { ...post, keyword_unread: false } : post) };
  });
  return changed ? next : entries;
}

export function parseKeywordNotifications<T extends StoredPost>(raw: string | null): KeywordEntry<T>[] {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  const invalid = () => new Error('キーワード通知の保存データが不正です');
  if (!Array.isArray(data)) throw invalid();
  const ids = new Set<string>();
  for (const entry of data) {
    const rule = entry?.rule;
    if (!rule || typeof rule.id !== 'string' || !rule.id || ids.has(rule.id)
      || typeof rule.name !== 'string' || typeof rule.query !== 'string' || typeof rule.regex !== 'boolean'
      || !['highlight', 'notify', 'regex_unicode'].every(field => rule[field] === undefined || typeof rule[field] === 'boolean')
      || (rule.ignore_width !== undefined && typeof rule.ignore_width !== 'boolean')
      || !rule.targets || !['title', 'name', 'body'].every(field => typeof rule.targets[field] === 'boolean')
      || validateKeywordRule(rule, data.map(entry => entry?.rule).filter(Boolean)) || !Array.isArray(entry.posts)) throw invalid();
    ids.add(rule.id);
    const posts = parsePostLog(JSON.stringify(entry.posts));
    if (posts.length !== entry.posts.length || !posts.every(post => typeof post.keyword_unread === 'boolean')) throw invalid();
  }
  return data;
}

/** 通知と同じ照合条件で、テスト文字列内の重ならない一致位置を返す。 */
export function keywordPreviewMatches(query: string, regex: boolean, text: string, ignoreWidth = false, unicode = false): Array<{ start: number; end: number }> {
  if (!query) return [];
  const mapped = ignoreWidth ? keywordWidthMap(text) : null;
  if (ignoreWidth) query = regex ? normalizeKeywordPattern(query) : normalizeKeywordWidth(query);
  const pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from((mapped?.text ?? text).matchAll(new RegExp(pattern, unicode ? 'gu' : 'g')), match => {
    const start = mapped ? (mapped.starts[match.index] ?? text.length) : match.index;
    const end = match[0].length === 0 ? start : mapped
      ? mapped.ends[match.index + match[0].length - 1] : match.index + match[0].length;
    return { start, end };
  });
}

export type KeywordStore<T extends StoredPost> = { entries: KeywordEntry<T>[]; migrated_highlights: string[] };

export function parseKeywordStore<T extends StoredPost>(raw: string | null): KeywordStore<T> {
  if (!raw) return { entries: [], migrated_highlights: [] };
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { entries: parseKeywordNotifications<T>(raw), migrated_highlights: [] };
  if (!parsed || !Array.isArray(parsed.migrated_highlights)
    || !parsed.migrated_highlights.every((key: unknown) => typeof key === 'string') || !Array.isArray(parsed.entries)) {
    throw new Error('キーワード通知の保存データが不正です');
  }
  return { entries: parseKeywordNotifications<T>(JSON.stringify(parsed.entries)), migrated_highlights: parsed.migrated_highlights };
}

/** 元設定の内容を履歴に残し、削除・編集した移行ルールを次回起動で復活させない。 */
export function migrateLegacyHighlights<T extends StoredPost>(store: KeywordStore<T>, handle: string, body: string): KeywordStore<T> {
  let next = store;
  for (const [field, raw] of [['handle', handle], ['body', body]]) {
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    const key = JSON.stringify([field, raw]);
    if (!lines.length || next.migrated_highlights.includes(key)) continue;
    const query = lines.length === 1 ? lines[0] : lines.map(line => `(?:${line})`).join('|');
    const rule: KeywordRule = {
      id: `legacy-highlight:${key}`, name: field === 'handle' ? 'ハンドルのハイライト（移行）' : '本文のハイライト（移行）',
      query, regex: true, regex_unicode: true, highlight: true, notify: false,
      targets: { title: field === 'handle', name: field === 'handle', body: field === 'body' },
    };
    const error = validateKeywordRule(rule);
    if (error) throw new Error(`${rule.name}: ${error}`);
    next = { entries: [...next.entries, { rule, posts: [] }], migrated_highlights: [...next.migrated_highlights, key] };
  }
  return next;
}

export function keywordHighlightRanges(rules: KeywordRule[], field: keyof KeywordTargets, text: string): Array<{ start: number; end: number }> {
  const ranges = rules.filter(rule => rule.highlight && rule.targets[field])
    .flatMap(rule => keywordPreviewMatches(rule.query, rule.regex, text, rule.ignore_width, rule.regex_unicode))
    .filter(range => range.end > range.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** 旧ルールの登録順による割当を固定し、以後の削除・追加でずらさない。 */
export function initializeKeywordShortcuts<T extends StoredPost>(entries: KeywordEntry<T>[]): KeywordEntry<T>[] {
  const used = new Set(entries.map(entry => entry.rule.shortcut).filter(Boolean));
  return entries.map((entry, index) => {
    if (entry.rule.shortcut !== undefined) return entry;
    const key = index < 9 ? String(index + 1) : index === 9 ? '0' : '';
    const shortcut = used.has(key) ? '' : key;
    if (shortcut) used.add(shortcut);
    return { ...entry, rule: { ...entry.rule, shortcut } };
  });
}
