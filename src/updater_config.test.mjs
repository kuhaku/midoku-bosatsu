import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('updater config declares the release endpoint, public key, and permissions', async () => {
  const config = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  );
  const capabilities = JSON.parse(
    await readFile(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'),
  );

  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/kuhaku/midoku-bosatsu/releases/latest/download/latest.json',
  ]);
  const decodedPublicKey = Buffer.from(config.plugins.updater.pubkey, 'base64').toString('utf8');
  const publicKeyLines = decodedPublicKey.trimEnd().split('\n');
  assert.equal(
    Buffer.from(decodedPublicKey, 'utf8').toString('base64'),
    config.plugins.updater.pubkey,
  );
  assert.match(publicKeyLines[0], /^untrusted comment: minisign public key: [A-F0-9]{16}$/);
  assert.match(publicKeyLines[1], /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(Buffer.from(publicKeyLines[1], 'base64').length, 42);
  assert.equal(publicKeyLines.length, 2);
  assert.ok(capabilities.permissions.includes('updater:default'));
  assert.ok(capabilities.permissions.includes('process:allow-restart'));
});
