import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setVersionScript = fileURLToPath(
  new URL('../scripts/set-version.mjs', import.meta.url),
);

async function createVersionFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'midoku-set-version-'));
  await mkdir(join(directory, 'src-tauri'));
  await writeFile(join(directory, 'package.json'), `${JSON.stringify({
    name: 'midoku-bosatsu',
    version: '0.5.5',
  }, null, 2)}\n`);
  await writeFile(join(directory, 'src-tauri/tauri.conf.json'), `${JSON.stringify({
    productName: 'midoku-bosatsu',
    version: '0.5.5',
  }, null, 2)}\n`);
  await writeFile(
    join(directory, 'src-tauri/Cargo.toml'),
    '[package]\nname = "midoku-bosatsu"\nversion = "0.5.5"\n\n[dependencies]\nserde = "1"\n',
  );
  return directory;
}

test('set-version updates every application version from its command-line argument', async () => {
  const directory = await createVersionFixture();

  try {
    const result = spawnSync(process.execPath, [setVersionScript, '0.6.0'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    assert.equal(JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).version, '0.6.0');
    assert.equal(
      JSON.parse(await readFile(join(directory, 'src-tauri/tauri.conf.json'), 'utf8')).version,
      '0.6.0',
    );
    assert.match(
      await readFile(join(directory, 'src-tauri/Cargo.toml'), 'utf8'),
      /^version = "0\.6\.0"$/m,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('set-version rejects an invalid version without modifying files', async () => {
  const directory = await createVersionFixture();
  const packagePath = join(directory, 'package.json');
  const before = await readFile(packagePath, 'utf8');

  try {
    const result = spawnSync(process.execPath, [setVersionScript, 'next'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /valid semantic version/i);
    assert.equal(await readFile(packagePath, 'utf8'), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
