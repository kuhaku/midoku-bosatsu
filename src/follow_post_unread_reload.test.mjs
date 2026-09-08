import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('フォロー投稿の成功後は対象BBSを強制的に未読リロードする', async () => {
  const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

  assert.match(
    main,
    /async function reloadUnreadAfterFollowPost\(siteId: string\): Promise<void> \{[\s\S]*?invoke<SiteFetchResult>\('reload_site_unread', \{ siteId \}\)[\s\S]*?mergePosts\(result\.posts\)/u,
  );
  assert.match(
    main,
    /if \(!result\.error_message\.trim\(\)\) \{[\s\S]*?if \(kind === 'follow'\) await reloadUnreadAfterFollowPost\(siteId\);/u,
  );
});
