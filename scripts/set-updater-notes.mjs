import { readFile, writeFile } from 'node:fs/promises';

const [manifestPath, notesPath] = process.argv.slice(2);

if (!manifestPath || !notesPath) {
  throw new Error('usage: node scripts/set-updater-notes.mjs <latest.json> <notes.md>');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.notes = await readFile(notesPath, 'utf8');

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
