import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { buildTreeNodePrefixes } from './tree_layout.ts';

const source = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
const start = source.indexOf('function compareOldestFirst(');
const end = source.indexOf('function createTreeActionLink(', start);
const buildGroups = new Function('config', 'compareNewestFirst', 'buildTreeNodePrefixes',
  `${stripTypeScriptTypes(source.slice(start, end))}\nreturn buildTreeDisplayGroups;`,
)(null, (a, b) => Number(b.id) - Number(a.id), buildTreeNodePrefixes);

for (const prefix of ['', 'a']) {
  test(`返信元が ${prefix || '数値のみ'} の投稿IDでも保存済みスレッドの多段返信を再現する`, () => {
    const posts = [
      ['3226834', '3226815'], ['3226831', '3226819'],
      ['3226821', '3226819'], ['3226819', '3226818'],
      ['3226818', '3226815'], ['3226815', null],
    ].map(([id, parent]) => ({
      id, parent_id: parent ? `${prefix}${parent}` : null,
      thread_id: '3226815', site_id: 'okome-znti',
    }));
    const [group] = buildGroups(posts);
    assert.deepEqual(group.items.map(({ post, parentPost, depth }) =>
      [post.id, parentPost?.id ?? null, depth]), [
      ['3226815', null, 0],
      ['3226818', '3226815', 1],
      ['3226819', '3226818', 2],
      ['3226821', '3226819', 3],
      ['3226831', '3226819', 3],
      ['3226834', '3226815', 1],
    ]);
  });
}
