import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const manifestScript = fileURLToPath(
  new URL('../scripts/generate-updater-manifest.mjs', import.meta.url),
);

test('updater manifest merges signatures for every updater platform', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'midoku-updater-manifest-'));
  const assetsDirectory = join(directory, 'release-assets');
  const outputDirectory = join(directory, 'release-assets-to-upload');
  const files = [
    'release-assets-linux-x86_64/midoku-bosatsu_0.2.0_amd64.AppImage',
    'release-assets-linux-x86_64/midoku-bosatsu_0.2.0_amd64.AppImage.sig',
    'release-assets-windows-x64/src-tauri/target/release/bundle/nsis/midoku-bosatsu_0.2.0_x64-setup.exe',
    'release-assets-windows-x64/src-tauri/target/release/bundle/nsis/midoku-bosatsu_0.2.0_x64-setup.exe.sig',
    'release-assets-macos-aarch64/midoku-bosatsu.app.tar.gz',
    'release-assets-macos-aarch64/midoku-bosatsu.app.tar.gz.sig',
    'release-assets-macos-x86_64/midoku-bosatsu.app.tar.gz',
    'release-assets-macos-x86_64/midoku-bosatsu.app.tar.gz.sig',
    'release-assets-macos-aarch64/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/empty',
  ];

  try {
    await Promise.all(files.map(async (file) => {
      const path = join(assetsDirectory, file);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, file.endsWith('.sig') ? `signature for ${file}\n` : 'bundle');
    }));
    const result = spawnSync(process.execPath, [manifestScript, assetsDirectory, outputDirectory], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REF_NAME: 'app-v0.2.0',
        GITHUB_REPOSITORY: 'kuhaku/midoku-bosatsu',
        GITHUB_SERVER_URL: 'https://github.com',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(await readFile(join(outputDirectory, 'latest.json'), 'utf8'));
    assert.equal(manifest.version, '0.2.0');
    assert.equal(typeof manifest.pub_date, 'string');
    assert.ok(!Number.isNaN(Date.parse(manifest.pub_date)));
    assert.deepEqual(Object.keys(manifest.platforms), [
      'darwin-aarch64',
      'darwin-x86_64',
      'linux-x86_64',
      'windows-x86_64',
    ]);
    assert.equal(manifest.platforms['darwin-aarch64'].signature, 'signature for release-assets-macos-aarch64/midoku-bosatsu.app.tar.gz.sig');
    assert.match(manifest.platforms['darwin-aarch64'].url, /release-assets-macos-aarch64-midoku-bosatsu\.app\.tar\.gz$/);
    assert.match(manifest.platforms['linux-x86_64'].url, /midoku-bosatsu_0\.2\.0_amd64\.AppImage$/);
    assert.equal(
      manifest.platforms['windows-x86_64'].signature,
      'signature for release-assets-windows-x64/src-tauri/target/release/bundle/nsis/midoku-bosatsu_0.2.0_x64-setup.exe.sig',
    );
    assert.match(manifest.platforms['windows-x86_64'].url, /midoku-bosatsu_0\.2\.0_x64-setup\.exe$/);
    assert.match(await readFile(join(outputDirectory, 'release-assets-macos-x86_64-midoku-bosatsu.app.tar.gz'), 'utf8'), /bundle/);
    assert.ok(!(await readdir(outputDirectory)).includes('empty'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
