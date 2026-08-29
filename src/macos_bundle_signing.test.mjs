import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('macOS bundles use an ad-hoc signature when no Apple certificate is configured', async () => {
  const config = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );

  assert.equal(config.bundle.macOS.signingIdentity, '-');
});
