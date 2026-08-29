import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const versionGuardPath = fileURLToPath(
  new URL('../scripts/verify-release-version.mjs', import.meta.url),
);

async function createVersionFixture(versions) {
  const directory = await mkdtemp(join(tmpdir(), 'midoku-release-version-'));
  await mkdir(join(directory, 'src-tauri'));
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify({ version: versions.package }, null, 2)}\n`,
  );
  await writeFile(
    join(directory, 'src-tauri/tauri.conf.json'),
    `${JSON.stringify({ version: versions.tauri }, null, 2)}\n`,
  );
  await writeFile(
    join(directory, 'src-tauri/Cargo.toml'),
    `[package]\nname = "midoku-bosatsu"\nversion = "${versions.cargo}"\n\n[dependencies]\n`,
  );
  return directory;
}

function runVersionGuard(directory, refName) {
  return spawnSync(process.execPath, [versionGuardPath], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REF_NAME: refName },
  });
}

test('release version guard accepts only a tag matching all three package versions', async () => {
  const directory = await createVersionFixture({
    package: '0.2.0',
    tauri: '0.2.0',
    cargo: '0.2.0',
  });

  try {
    const result = runVersionGuard(directory, 'app-v0.2.0');
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [label, versions, refName] of [
  [
    'package.json mismatch',
    { package: '0.2.1', tauri: '0.2.0', cargo: '0.2.0' },
    'app-v0.2.0',
  ],
  [
    'tauri.conf.json mismatch',
    { package: '0.2.0', tauri: '0.2.1', cargo: '0.2.0' },
    'app-v0.2.0',
  ],
  [
    'Cargo.toml mismatch',
    { package: '0.2.0', tauri: '0.2.0', cargo: '0.2.1' },
    'app-v0.2.0',
  ],
  [
    'tag mismatch',
    { package: '0.2.0', tauri: '0.2.0', cargo: '0.2.0' },
    'app-v0.2.1',
  ],
]) {
  test(`release version guard rejects ${label}`, async () => {
    const directory = await createVersionFixture(versions);

    try {
      const result = runVersionGuard(directory, refName);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /release version check failed/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('release workflow accepts app-v tags and configures signing and release publishing', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

  assert.match(workflow, /app-v\*/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
  assert.match(workflow, /GITHUB_TOKEN/);
  assert.match(workflow, /tauri-apps\/tauri-action/);
  assert.match(workflow, /GITHUB_REF_NAME/);
  assert.match(workflow, /package\.json/);
  assert.match(workflow, /src-tauri\/tauri\.conf\.json/);
  assert.match(workflow, /src-tauri\/Cargo\.toml/);
  assert.match(workflow, /verify-release-version\.mjs/);
  assert.match(workflow, /max-parallel:\s*1/);
  assert.match(workflow, /name: Windows x64\s+platform: windows-latest\s+args: --bundles nsis/);
  assert.doesNotMatch(workflow, /args: --bundles nsis,msi/);
  assert.match(workflow, /tagName:\s*app-v__VERSION__/);
  assert.match(workflow, /releaseName:\s*'未読菩薩 v__VERSION__'/);
  assert.match(workflow, /releaseDraft:\s*true/);
  assert.match(workflow, /publish-release:/);
  assert.match(workflow, /needs:\s*build-and-release/);
  assert.match(
    workflow,
    /publish-release:[\s\S]*?steps:\s*- name: Check out repository\s+uses: actions\/checkout@v4/,
  );
  assert.match(workflow, /gh release edit/);
  assert.match(workflow, /--draft=false/);
});
