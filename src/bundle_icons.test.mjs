import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tauriDirectory = new URL('../src-tauri/', import.meta.url);

test('desktop bundles have configured icons for Windows, macOS, and common Linux sizes', async () => {
  const config = JSON.parse(
    await readFile(new URL('tauri.conf.json', tauriDirectory), 'utf8'),
  );
  const configuredIcons = config.bundle.icon;
  const iconFiles = await Promise.all(
    configuredIcons.map(async (relativePath) => ({
      relativePath,
      contents: await readFile(new URL(relativePath, tauriDirectory)),
    })),
  );

  const windowsIcon = iconFiles.find(({ relativePath }) => relativePath.endsWith('.ico'));
  assert.ok(windowsIcon, 'Windows bundles require a configured .ico icon');
  assert.deepEqual([...windowsIcon.contents.subarray(0, 4)], [0, 0, 1, 0]);

  const macOSIcon = iconFiles.find(({ relativePath }) => relativePath.endsWith('.icns'));
  assert.ok(macOSIcon, 'macOS bundles require a configured .icns icon');
  assert.equal(macOSIcon.contents.subarray(0, 4).toString('ascii'), 'icns');

  const pngWidths = iconFiles
    .filter(({ relativePath }) => relativePath.endsWith('.png'))
    .map(({ contents }) => contents.readUInt32BE(16))
    .sort((a, b) => a - b);
  assert.deepEqual(pngWidths, [32, 64, 128, 256, 512]);
});
