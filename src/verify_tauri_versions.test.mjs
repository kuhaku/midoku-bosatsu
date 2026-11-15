import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

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
  await writeFile(join(directory, 'package-lock.json'), 'original npm lock\n');
  await writeFile(join(directory, 'src-tauri/Cargo.toml'), cargoToml);
  await writeFile(join(directory, 'src-tauri/Cargo.lock'), 'original cargo lock\n');
  return directory;
}

async function readVersionFiles(directory) {
  const relativePaths = [
    'package.json',
    'package-lock.json',
    'src-tauri/Cargo.toml',
    'src-tauri/Cargo.lock',
  ];
  return Object.fromEntries(await Promise.all(relativePaths.map(async (relativePath) => [
    relativePath,
    await readFile(join(directory, relativePath), 'utf8'),
  ])));
}

function runVersionGuard(directory) {
  return spawnSync(process.execPath, [versionGuardPath], {
    cwd: directory,
    encoding: 'utf8',
  });
}

const importDirectory = await createFixture();
const originalDirectory = process.cwd();
let versionGuard;
try {
  process.chdir(importDirectory);
  versionGuard = await import(versionGuardPath);
} finally {
  process.chdir(originalDirectory);
  await rm(importDirectory, { recursive: true, force: true });
}

const {
  buildNpmCommand,
  compareSemanticVersions,
  planTauriVersionUpdates,
  promptForVersionSync,
  synchronizeTauriVersions,
} = versionGuard;

test('semantic version comparison ranks a stable version above its prerelease', () => {
  assert.ok(compareSemanticVersions('2.14.0', '2.14.0-rc.1') > 0);
});

test('semantic version comparison orders numeric prerelease identifiers numerically', () => {
  assert.ok(compareSemanticVersions('2.14.0-rc.10', '2.14.0-rc.2') > 0);
});

test('semantic version comparison preserves hyphens inside prerelease identifiers', () => {
  assert.ok(compareSemanticVersions('2.14.0-alpha-b', '2.14.0-alpha-a') > 0);
});

test('npm command uses the Windows command processor for npm.cmd', () => {
  assert.deepEqual(
    buildNpmCommand(['install', '--package-lock-only'], 'win32', 'C:\\Windows\\System32\\cmd.exe'),
    {
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'install', '--package-lock-only'],
    },
  );
});

test('Tauri version planner groups core dependencies while keeping plugin pairs independent', () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/api'] = '^2.12.1';
  packageJson.devDependencies['@tauri-apps/cli'] = '^2.14.0';
  packageJson.dependencies['@tauri-apps/plugin-dialog'] = '^2.9.0';
  const cargoSource = matchingCargo
    .replace('tauri = { version = "2.12.1"', 'tauri = { version = "2.13.5"')
    .replace('tauri-plugin-dialog = "2.8.1"', 'tauri-plugin-dialog = "2.8.4"');

  assert.deepEqual(planTauriVersionUpdates(packageJson, cargoSource), {
    problems: [],
    changes: [
      {
        manifest: 'package',
        dependency: '@tauri-apps/api',
        currentRequirement: '^2.12.1',
        targetVersion: '2.14.0',
      },
      {
        manifest: 'cargo',
        dependency: 'tauri',
        currentRequirement: '2.13.5',
        targetVersion: '2.14.0',
      },
      {
        manifest: 'cargo',
        dependency: 'tauri-plugin-dialog',
        currentRequirement: '2.8.4',
        targetVersion: '2.9.0',
      },
    ],
  });
});

for (const [label, input, expected] of [
  ['lowercase y', 'y\n', true],
  ['uppercase Y', 'Y\n', false],
  ['another answer', 'n\n', false],
  ['end of input', '', false],
]) {
  test(`version sync prompt handles ${label}`, async () => {
    let output = '';
    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });

    assert.equal(
      await promptForVersionSync(Readable.from([input]), outputStream),
      expected,
    );
    assert.match(output, /Update to the greatest versions\? \[y\/N]/);
  });
}

test('declining version sync leaves manifests and lockfiles unchanged', async () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/plugin-dialog'] = '^2.9.0';
  const directory = await createFixture(packageJson);
  const before = await readVersionFiles(directory);
  const commandCalls = [];

  try {
    await assert.rejects(
      synchronizeTauriVersions(directory, {
        confirm: async () => false,
        runCommand: async (...args) => commandCalls.push(args),
      }),
      /declined/i,
    );
    assert.deepEqual(await readVersionFiles(directory), before);
    assert.deepEqual(commandCalls, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('declining version sync never runs package managers after an external manifest change', async () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/plugin-dialog'] = '^2.9.0';
  const directory = await createFixture(packageJson);
  const commandCalls = [];

  try {
    await assert.rejects(
      synchronizeTauriVersions(directory, {
        confirm: async () => {
          await writeFile(
            join(directory, 'src-tauri/Cargo.toml'),
            matchingCargo.replace('tauri-plugin-dialog = "2.8.1"', 'tauri-plugin-dialog = "2.9.0"'),
          );
          return false;
        },
        runCommand: async (...args) => commandCalls.push(args),
      }),
      /declined/i,
    );
    assert.deepEqual(commandCalls, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('confirmed version sync updates manifests and refreshes both lockfiles', async () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/api'] = '^2.12.1';
  packageJson.devDependencies['@tauri-apps/cli'] = '~2.14.0';
  packageJson.dependencies['@tauri-apps/plugin-dialog'] = '^2.9.0';
  const cargoSource = matchingCargo
    .replace('tauri = { version = "2.12.1"', 'tauri = { version = "2.13.5"')
    .replace('tauri-plugin-dialog = "2.8.1"', 'tauri-plugin-dialog = "2.8.4"');
  const directory = await createFixture(packageJson, cargoSource);
  const commandCalls = [];

  try {
    const result = await synchronizeTauriVersions(directory, {
      confirm: async () => true,
      runCommand: async (command, args, cwd) => {
        commandCalls.push({ command, args, cwd });
        if (command === 'npm') {
          await writeFile(join(directory, 'package-lock.json'), 'updated npm lock\n');
        } else {
          await writeFile(join(directory, 'src-tauri/Cargo.lock'), 'updated cargo lock\n');
        }
      },
    });

    assert.equal(result, 'updated');
    const updatedPackage = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    assert.equal(updatedPackage.dependencies['@tauri-apps/api'], '^2.14.0');
    assert.equal(updatedPackage.devDependencies['@tauri-apps/cli'], '~2.14.0');
    assert.equal(updatedPackage.dependencies['@tauri-apps/plugin-dialog'], '^2.9.0');

    const updatedCargo = await readFile(join(directory, 'src-tauri/Cargo.toml'), 'utf8');
    assert.match(updatedCargo, /tauri = \{ version = "2\.14\.0", features = \[\] }/);
    assert.match(updatedCargo, /tauri-plugin-dialog = "2\.9\.0"/);
    assert.deepEqual(commandCalls, [
      {
        command: 'npm',
        args: ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
        cwd: directory,
      },
      {
        command: 'cargo',
        args: ['update', '-p', 'tauri', '--precise', '2.14.0'],
        cwd: join(directory, 'src-tauri'),
      },
      {
        command: 'cargo',
        args: ['update', '-p', 'tauri-plugin-dialog', '--precise', '2.9.0'],
        cwd: join(directory, 'src-tauri'),
      },
    ]);
    assert.equal(await readFile(join(directory, 'package-lock.json'), 'utf8'), 'updated npm lock\n');
    assert.equal(await readFile(join(directory, 'src-tauri/Cargo.lock'), 'utf8'), 'updated cargo lock\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('version sync updates only version in an aliased Cargo inline dependency', async () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/api'] = '^2.14.0';
  packageJson.devDependencies['@tauri-apps/cli'] = '^2.14.0';
  const cargoSource = matchingCargo.replace(
    'tauri = { version = "2.12.1", features = [] }',
    'tauri = { package = "tauri", version = "2.13.5", features = [] }',
  );
  const directory = await createFixture(packageJson, cargoSource);

  try {
    assert.equal(await synchronizeTauriVersions(directory, {
      confirm: async () => true,
      runCommand: async () => {},
    }), 'updated');
    assert.match(
      await readFile(join(directory, 'src-tauri/Cargo.toml'), 'utf8'),
      /tauri = \{ package = "tauri", version = "2\.14\.0", features = \[\] }/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('version sync restores all manifests and lockfiles when a package manager fails', async () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/plugin-dialog'] = '^2.9.0';
  const directory = await createFixture(packageJson);
  const before = await readVersionFiles(directory);

  try {
    await assert.rejects(
      synchronizeTauriVersions(directory, {
        confirm: async () => true,
        runCommand: async () => {
          await writeFile(join(directory, 'package-lock.json'), 'partially updated npm lock\n');
          throw new Error('npm lock refresh failed');
        },
      }),
      /npm lock refresh failed/,
    );
    assert.deepEqual(await readVersionFiles(directory), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('version sync restores all files when the first manifest write fails', async () => {
  const packageJson = structuredClone(matchingPackage);
  packageJson.dependencies['@tauri-apps/plugin-dialog'] = '^2.9.0';
  const directory = await createFixture(packageJson);
  const before = await readVersionFiles(directory);
  let firstPackageWrite = true;

  try {
    await assert.rejects(
      synchronizeTauriVersions(directory, {
        confirm: async () => true,
        runCommand: async () => {},
        writeFile: async (path, source) => {
          if (path === join(directory, 'package.json') && firstPackageWrite) {
            firstPackageWrite = false;
            throw new Error('manifest write failed');
          }
          await writeFile(path, source);
        },
      }),
      /manifest write failed/,
    );
    assert.deepEqual(await readVersionFiles(directory), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
