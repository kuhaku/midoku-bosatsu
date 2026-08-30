import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setUpdaterNotesScript = fileURLToPath(
  new URL('../scripts/set-updater-notes.mjs', import.meta.url),
);

test('set-updater-notes adds Markdown release notes without changing existing manifest fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'midoku-set-updater-notes-'));
  const manifestPath = join(directory, 'latest.json');
  const notesPath = join(directory, 'notes.md');

  try {
    await writeFile(manifestPath, `${JSON.stringify({
      version: '0.4.0',
      platforms: {
        'darwin-aarch64': {
          url: 'https://example.test/midoku-bosatsu.app.tar.gz',
          signature: 'signature',
        },
      },
    }, null, 2)}\n`);
    await writeFile(notesPath, '## 変更内容\n\n- 未読一覧を改善\n');

    const result = spawnSync(process.execPath, [setUpdaterNotesScript, manifestPath, notesPath], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.deepEqual(manifest, {
      version: '0.4.0',
      platforms: {
        'darwin-aarch64': {
          url: 'https://example.test/midoku-bosatsu.app.tar.gz',
          signature: 'signature',
        },
      },
      notes: '## 変更内容\n\n- 未読一覧を改善\n',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
