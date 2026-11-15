import test from 'node:test';
import assert from 'node:assert/strict';
import * as kw from './keyword_notification.ts';
const post = (id, body_text = '猫', site_id = 'a') => ({ id, site_id, title: '題名', name: '投稿者', email: '猫', posted_at_raw: '', posted_at: null, follow_url: null, thread_url: null, parent_id: null, thread_id: null, body_html: body_text, body_text });
const rule = (overrides = {}) => ({ id: 'r', name: '猫の通知', query: '猫', regex: false, targets: { title: false, name: false, body: true }, ...overrides });
const entry = (r = rule()) => ({ rule: r, posts: [] });

test('初期検索対象は本文のみ', () => {
  assert.deepEqual(kw.defaultKeywordTargets(), { title: false, name: false, body: true });
});
test('検索対象なし・空欄・不正正規表現では保存できない', () => {
  assert.match(kw.validateKeywordRule(rule({ targets: { title: false, name: false, body: false } })), /検索対象/);
  assert.match(kw.validateKeywordRule(rule({ query: '  ' })), /ルール/);
  assert.match(kw.validateKeywordRule(rule({ name: '  ' })), /名前|名/);
  assert.match(kw.validateKeywordRule(rule({ query: '[', regex: true })), /正規表現/);
  assert.equal(kw.validateKeywordRule(rule()), null);
});
test('選択した対象のみ照合しメールや日付は対象にしない', () => {
  const p = post('1', '本文');
  assert.equal(kw.keywordMatcher(rule())(p), false);
  for (const [field, query] of [['title', '題名'], ['name', '投稿者'], ['body', '本文']]) {
    assert.equal(kw.keywordMatcher(rule({ query, targets: { title: false, name: false, body: false, [field]: true } }))(p), true);
  }
  assert.equal(kw.keywordMatcher(rule({ query: '題名\n投稿者', targets: { title: true, name: true, body: false } }))(p), false);
});
test('通常検索はリテラル部分一致、正規表現は各投稿で安定して照合', () => {
  assert.equal(kw.keywordMatcher(rule({ query: '猫|犬' }))(post('1')), false);
  const match = kw.keywordMatcher(rule({ query: '猫|犬', regex: true }));
  assert.equal(match(post('1')), true);
  assert.equal(match(post('2', '犬')), true);
});
test('重複取得は再通知せず、別BBSの同じIDは別投稿', () => {
  const first = kw.collectKeywordPosts([entry()], [post('1'), post('1'), post('1', '猫', 'b')], () => true);
  assert.equal(first.addedUnread, 2);
  assert.equal(kw.keywordUnreadCount(first.entries[0]), 2);
  const next = kw.collectKeywordPosts(first.entries, [post('1')], () => true);
  assert.equal(next.addedUnread, 0);
  assert.equal(next.entries, first.entries);
});
test('既読化後の再取得で未読に戻らず、複数ルール分は合計する', () => {
  let { entries } = kw.collectKeywordPosts([entry(), entry(rule({ id: 's' }))], [post('1')], () => true);
  assert.equal(entries.reduce((sum, e) => sum + kw.keywordUnreadCount(e), 0), 2);
  entries = kw.readKeywordPosts(entries, () => true);
  assert.equal(kw.collectKeywordPosts(entries, [post('1')], () => true).addedUnread, 0);
  assert.equal(entries.reduce((sum, e) => sum + kw.keywordUnreadCount(e), 0), 0);
});
test('既読投稿の取り込みは通知しない', () => {
  const result = kw.collectKeywordPosts([entry()], [post('1')], () => false);
  assert.equal(result.entries[0].posts.length, 1);
  assert.equal(result.addedUnread, 0);
});
test('ルール・投稿・未読状態を保存復元し、不正保存データを拒否', () => {
  const { entries } = kw.collectKeywordPosts([entry()], [post('1')], () => true);
  assert.deepEqual(kw.parseKeywordNotifications(JSON.stringify(entries)), entries);
  assert.deepEqual(kw.parseKeywordNotifications(null), []);
  assert.throws(() => kw.parseKeywordNotifications('oops'));
  assert.throws(() => kw.parseKeywordNotifications('[{}]'));
  assert.throws(() => kw.parseKeywordNotifications(JSON.stringify([{ ...entry(), posts: [{}] }])));
});

test('入力文字列の通常検索は特殊文字もそのまま照合し全一致位置を返す', () => {
  assert.deepEqual(kw.keywordPreviewMatches('a.b', false, 'a.b axb a.b'), [{ start: 0, end: 3 }, { start: 8, end: 11 }]);
});
test('正規表現のプレビューは改行を含む入力の一致部分だけを返す', () => {
  assert.deepEqual(kw.keywordPreviewMatches('猫|犬+', true, '猫と\n犬犬と鳥'), [{ start: 0, end: 1 }, { start: 3, end: 5 }]);
  assert.deepEqual(kw.keywordPreviewMatches('鳥', false, '<b>猫</b>'), []);
});
test('空ルール・空入力・ゼロ幅一致でも終了し、ゼロ幅の位置を保持する', () => {
  assert.deepEqual(kw.keywordPreviewMatches('', false, '猫'), []);
  assert.deepEqual(kw.keywordPreviewMatches('猫', false, ''), []);
  assert.deepEqual(kw.keywordPreviewMatches('(?=猫)|$', true, '猫'), [{ start: 0, end: 0 }, { start: 1, end: 1 }]);
});
test('不正な正規表現はプレビューの呼び出し側でエラーとして扱える', () => {
  assert.throws(() => kw.keywordPreviewMatches('[', true, '猫'), SyntaxError);
});

test('幅を無視すると全角英数字・空白・半角カナを双方向に照合する', () => {
  for (const [query, text] of [['ABC 123', 'ＡＢＣ　１２３'], ['ＡＢＣ', 'ABC'], ['ガッツポーズ', 'ｶﾞｯﾂﾎﾟｰｽﾞ'], ['ｶﾞｯﾂﾎﾟｰｽﾞ', 'ガッツポーズ']]) {
    assert.equal(kw.keywordMatcher(rule({ query, ignore_width: true }))(post('1', text)), true);
    assert.equal(kw.keywordMatcher(rule({ query }))(post('1', text)), false);
  }
  assert.equal(kw.keywordMatcher(rule({ query: 'A', ignore_width: true }))(post('1', 'a')), false);
  assert.equal(kw.keywordMatcher(rule({ query: '1', ignore_width: true }))(post('1', '①')), false);
});
test('幅無視プレビューは濁点を含む元の文字列の範囲をハイライトする', () => {
  assert.deepEqual(kw.keywordPreviewMatches('ガ', false, '😀ｶﾞとガ', true), [{ start: 2, end: 4 }, { start: 5, end: 6 }]);
  assert.deepEqual(kw.keywordPreviewMatches('ｶﾞ', false, 'ガとｶﾞ', true), [{ start: 0, end: 1 }, { start: 2, end: 4 }]);
});
test('正規表現でも幅を無視し、全角の記号を正規表現の構文に変えない', () => {
  for (const [query, text, expected] of [['[A-Z]+\\d+', 'ＡＢＣ１２', true], ['[Ａ-Ｚ]+', 'ABC', true], ['ガ+', 'ｶﾞｶﾞ', true], ['．', 'x', false], ['．', '.', true], ['\\ｄ', 'd', true], ['\\ｄ', '1', false]]) {
    const r = rule({ query, regex: true, ignore_width: true });
    assert.equal(kw.validateKeywordRule(r), null);
    assert.equal(kw.keywordMatcher(r)(post('1', text)), expected, query);
    assert.equal(kw.keywordPreviewMatches(query, true, text, true).length > 0, expected, query);
  }
});
test('幅無視オプションを保存復元し、旧ルールには幅無視を適用しない', () => {
  const state = [entry(rule({ ignore_width: true })), entry(rule({ id: 'old' }))];
  assert.deepEqual(kw.parseKeywordNotifications(JSON.stringify(state)), state);
  assert.throws(() => kw.parseKeywordNotifications(JSON.stringify([entry(rule({ ignore_width: 'true' }))])));
});
test('幅無視プレビューも正規表現のUTF-16位置と末尾のゼロ幅一致を保持する', () => {
  assert.deepEqual(kw.keywordPreviewMatches('.', true, '😀Ａ', true), [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }]);
  assert.deepEqual(kw.keywordPreviewMatches('$', true, 'ｶﾞ', true), [{ start: 2, end: 2 }]);
});

test('ハイライトのみのルールは通知投稿と未読数を増やさない', () => {
  const e = entry(rule({ highlight: true, notify: false }));
  const result = kw.collectKeywordPosts([e], [post('1')], () => true);
  assert.equal(result.addedUnread, 0);
  assert.equal(result.entries[0].posts.length, 0);
  assert.equal(kw.keywordUnreadCount({ ...e, posts: [{ ...post('1'), keyword_unread: true }] }), 0);
});
test('ハイライトは対象フィールド・幅無視を反映し重複範囲を結合する', () => {
  const rules = [rule({ query: 'ガ猫', highlight: true, ignore_width: true }), rule({ id: 's', query: '猫犬', highlight: true }), rule({ id: 't', query: '鳥', notify: true })];
  assert.deepEqual(kw.keywordHighlightRanges(rules, 'body', 'ｶﾞ猫犬鳥'), [{ start: 0, end: 4 }]);
  assert.deepEqual(kw.keywordHighlightRanges(rules, 'title', 'ｶﾞ猫犬鳥'), []);
});
test('旧ハイライトの改行OR・Unicode照合を維持し通知OFFで一度だけ移行する', () => {
  let store = kw.parseKeywordStore(null);
  store = kw.migrateLegacyHighlights(store, '猫\n犬', '.');
  assert.equal(store.entries.length, 2);
  assert.equal(store.entries[0].rule.query, '(?:猫)|(?:犬)');
  assert.deepEqual(store.entries[0].rule.targets, { title: true, name: true, body: false });
  assert.deepEqual(store.entries[1].rule.targets, { title: false, name: false, body: true });
  for (const e of store.entries) { assert.equal(e.rule.highlight, true); assert.equal(e.rule.notify, false); }
  assert.deepEqual(kw.keywordHighlightRanges([store.entries[1].rule], 'body', '😀'), [{ start: 0, end: 2 }]);
  store = kw.parseKeywordStore(JSON.stringify({ ...store, entries: [] }));
  assert.equal(kw.migrateLegacyHighlights(store, '猫\n犬', '.').entries.length, 0, '移行後に削除したルールは復活しない');
});
test('旧キーワード保存形式は通知のみとして読み込め、新形式は移行履歴を保持する', () => {
  const store = kw.parseKeywordStore(JSON.stringify([entry()]));
  assert.deepEqual(store.entries, [entry()]);
  assert.deepEqual(store.migrated_highlights, []);
  assert.deepEqual(kw.keywordHighlightRanges([store.entries[0].rule], 'body', '猫'), []);
  assert.throws(() => kw.parseKeywordStore('{"entries":[],"migrated_highlights":false}'));
  assert.throws(() => kw.parseKeywordNotifications(JSON.stringify([entry(rule({ notify: 'false' }))])));
});

test('ショートカットは数字または未割当のみで、他ルールとの重複を拒否する', () => {
  const existing = rule({ shortcut: '3' });
  assert.equal(kw.validateKeywordRule(existing, [existing]), null);
  assert.match(kw.validateKeywordRule(rule({ id: 'other', shortcut: '3' }), [existing]), /使用/);
  for (const shortcut of ['', '0', '9']) assert.equal(kw.validateKeywordRule(rule({ shortcut })), null);
  for (const shortcut of ['10', 'a', 1, null]) {
    assert.match(kw.validateKeywordRule(rule({ shortcut })), /ショートカット/);
    assert.throws(() => kw.parseKeywordNotifications(JSON.stringify([entry(rule({ shortcut }))])));
  }
  const saved = [entry(rule({ shortcut: '0' })), entry(rule({ id: 'none', shortcut: '' }))];
  assert.deepEqual(kw.parseKeywordNotifications(JSON.stringify(saved)), saved);
});

test('既存の登録順ショートカットを固定し、保存復元・削除後も割当を維持する', () => {
  const entries = Array.from({ length: 11 }, (_, i) => entry(rule({ id: String(i) })));
  const next = kw.initializeKeywordShortcuts(entries);
  assert.deepEqual(next.map(e => e.rule.shortcut), ['1','2','3','4','5','6','7','8','9','0','']);
  const restored = kw.parseKeywordNotifications(JSON.stringify(next.slice(1)));
  assert.deepEqual(kw.initializeKeywordShortcuts(restored), restored);
  const mixed = kw.initializeKeywordShortcuts([entry(rule()), entry(rule({ id: 'custom', shortcut: '1' }))]);
  assert.equal(mixed[0].rule.shortcut, '');
  assert.equal(mixed[1].rule.shortcut, '1');
});
