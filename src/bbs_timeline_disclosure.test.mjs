import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('BBS一覧は初期状態で閉じ、クリックごとに開閉状態を支援技術にも伝える', () => {
  assert.match(source, /id="bbs-timeline-switcher-button"[^>]*aria-expanded="false"/u);
  assert.match(source, /id="bbs-timeline-menu"[^>]*hidden/u);
  const handler = source.match(/bbsTimelineSwitcherButton\.addEventListener\('click', \(\) => \{([\s\S]*?)\n\}\);/u)?.[1];
  assert.ok(handler, 'クリックによる開閉処理が必要');
  const attributes = {};
  const context = {
    bbsTimelineMenu: { hidden: true },
    bbsTimelineSwitcherButton: { setAttribute: (key, value) => { attributes[key] = value; } },
  };
  vm.runInNewContext(handler, context);
  assert.equal(context.bbsTimelineMenu.hidden, false);
  assert.equal(attributes['aria-expanded'], 'true');
  vm.runInNewContext(handler, context);
  assert.equal(context.bbsTimelineMenu.hidden, true);
  assert.equal(attributes['aria-expanded'], 'false');
});
