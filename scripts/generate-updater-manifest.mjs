import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

const [assetsDirectory, outputDirectory] = process.argv.slice(2);

if (!assetsDirectory || !outputDirectory) {
  throw new Error('usage: node scripts/generate-updater-manifest.mjs <assets-directory> <output-directory>');
}

const { GITHUB_REF_NAME, GITHUB_REPOSITORY, GITHUB_SERVER_URL } = process.env;
if (!GITHUB_REF_NAME?.startsWith('app-v') || !GITHUB_REPOSITORY || !GITHUB_SERVER_URL) {
  throw new Error('GITHUB_REF_NAME, GITHUB_REPOSITORY, and GITHUB_SERVER_URL must be set');
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nestedFiles.flat();
}

function findSingle(files, matches, label) {
  const matchedFiles = files.filter(matches);
  if (matchedFiles.length !== 1) {
    throw new Error(`expected exactly one ${label} artifact, found ${matchedFiles.length}`);
  }
  return matchedFiles[0];
}

function isReleaseAsset(file) {
  const name = basename(file);
  const unsignedName = name.endsWith('.sig') ? name.slice(0, -'.sig'.length) : name;
  return /\.(zip|dmg|app\.tar\.gz|appimage|deb|rpm|exe)$/i.test(unsignedName);
}

const files = await listFiles(assetsDirectory);
const uploadFiles = files.filter(isReleaseAsset);
const releaseUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/releases/download/${GITHUB_REF_NAME}`;
const filesByName = Map.groupBy(uploadFiles, (file) => basename(file));
const uploadedNames = new Map(uploadFiles.map((file) => {
  const [artifactName] = relative(assetsDirectory, file).split(/[\\/]/);
  const name = basename(file);
  return [file, filesByName.get(name).length > 1 ? `${artifactName}-${name}` : name];
}));

await mkdir(outputDirectory, { recursive: true });
await Promise.all(uploadFiles.map((file) => copyFile(file, join(outputDirectory, uploadedNames.get(file)))));

const updaterArtifacts = [
  ['darwin-aarch64', /release-assets-macos-aarch64[\\/].*\.app\.tar\.gz$/, 'macOS Apple Silicon updater'],
  ['darwin-x86_64', /release-assets-macos-x86_64[\\/].*\.app\.tar\.gz$/, 'macOS Intel updater'],
  ['linux-x86_64', /release-assets-linux-x86_64[\\/].*\.AppImage$/, 'Linux updater'],
  ['windows-x86_64', /release-assets-windows-x64[\\/].*bundle[\\/]nsis[\\/].*-setup\.exe$/i, 'Windows NSIS updater'],
];

const platforms = Object.fromEntries(await Promise.all(updaterArtifacts.map(async ([platform, bundlePattern, label]) => {
  const bundle = findSingle(files, (file) => bundlePattern.test(file), label);
  const signature = `${bundle}.sig`;
  if (!files.includes(signature)) {
    throw new Error(`missing ${label} signature`);
  }
  return [platform, {
    url: `${releaseUrl}/${encodeURIComponent(uploadedNames.get(bundle))}`,
    signature: (await readFile(signature, 'utf8')).trim(),
  }];
})));

await writeFile(join(outputDirectory, 'latest.json'), `${JSON.stringify({
  version: GITHUB_REF_NAME.slice('app-v'.length),
  platforms,
}, null, 2)}\n`);
