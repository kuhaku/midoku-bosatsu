import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const versionGuardPath = fileURLToPath(
  new URL('../scripts/verify-tauri-versions.mjs', import.meta.url),
);

const matchingPackage = {
  dependencies: {
    '@tauri-apps/api': '^2.12.1',
    '@tauri-apps/plugin-dialog': '^2.8.1',
    '@tauri-apps/plugin-opener': '~2.7.0',
    '@tauri-apps/plugin-process': '2.4.0',
    '@tauri-apps/plugin-updater': '^2.13.1',
  },
  devDependencies: {
    '@tauri-apps/cli': '^2.12.1',
  },
};

const matchingCargo = `[build-dependencies]
tauri-build = { version = "2.7.1", features = [] }

[dependencies]
tauri = { version = "2.12.1", features = [] }
tauri-plugin-dialog = "2.8.1"
tauri-plugin-opener = "2.7.0"

[target.'cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))'.dependencies]
tauri-plugin-process = "2.4.0"
tauri-plugin-updater = "2.13.1"
tauri-plugin-window-state = "2.4.1"
`;

async function createFixture(packageJson = matchingPackage, cargoToml = matchingCargo) {
  const directory = await mkdtemp(join(tmpdir(), 'midoku-tauri-versions-'));
  await mkdir(join(directory, 'src-tauri'));
  await writeFile(join(directory, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(join(directory, 'src-tauri/Cargo.toml'), cargoToml);
  return directory;
}

function runVersionGuard(directory) {
  return spawnSync(process.execPath, [versionGuardPath], {
    cwd: directory,
    encoding: 'utf8',
  });
}

test('Tauri version guard accepts matching core and plugin versions', async () => {
  const directory = await createFixture();

  try {
    const result = runVersionGuard(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Tauri dependency version check passed/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Tauri version guard reports mismatched dependency versions', async () => {
  const directory = await createFixture(
    {
      ...matchingPackage,
      dependencies: {
        ...matchingPackage.dependencies,
        '@tauri-apps/plugin-updater': '^2.14.0',
      },
    },
  );

  try {
    const result = runVersionGuard(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /@tauri-apps\/plugin-updater=\^2\.14\.0/);
    assert.match(result.stderr, /tauri-plugin-updater=2\.13\.1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Tauri version guard reports a CLI version that differs from the Rust core', async () => {
  const directory = await createFixture({
    ...matchingPackage,
    devDependencies: {
      ...matchingPackage.devDependencies,
      '@tauri-apps/cli': '^2.13.0',
    },
  });

  try {
    const result = runVersionGuard(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /@tauri-apps\/cli=\^2\.13\.0/);
    assert.match(result.stderr, /tauri=2\.12\.1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Tauri version guard rejects a dependency missing from one manifest', async () => {
  const packageWithoutDialog = structuredClone(matchingPackage);
  delete packageWithoutDialog.dependencies['@tauri-apps/plugin-dialog'];
  const directory = await createFixture(packageWithoutDialog);

  try {
    const result = runVersionGuard(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /@tauri-apps\/plugin-dialog is missing/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
