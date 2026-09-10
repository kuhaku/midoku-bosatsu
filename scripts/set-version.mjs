import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [version] = process.argv.slice(2);
const semanticVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

if (!version) {
  throw new Error('usage: node scripts/set-version.mjs <version>');
}

if (!semanticVersionPattern.test(version)) {
  throw new Error(`version must be a valid semantic version: ${version}`);
}

function replaceCargoPackageVersion(source) {
  let inPackageSection = false;
  let replaced = false;

  const updated = source.split(/(\r?\n)/).map((line) => {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (section) {
      inPackageSection = section[1] === 'package';
      return line;
    }

    if (!inPackageSection || replaced || !/^\s*version\s*=\s*"[^"]+"\s*(?:#.*)?$/.test(line)) {
      return line;
    }

    replaced = true;
    return line.replace(/"[^"]+"/, `"${version}"`);
  }).join('');

  if (!replaced) throw new Error('src-tauri/Cargo.toml has no [package] version');
  return updated;
}

const paths = {
  package: resolve('package.json'),
  tauri: resolve('src-tauri/tauri.conf.json'),
  cargo: resolve('src-tauri/Cargo.toml'),
};

const [packageSource, tauriSource, cargoSource] = await Promise.all([
  readFile(paths.package, 'utf8'),
  readFile(paths.tauri, 'utf8'),
  readFile(paths.cargo, 'utf8'),
]);

const packageJson = JSON.parse(packageSource);
const tauriConfig = JSON.parse(tauriSource);
if (typeof packageJson.version !== 'string') throw new Error('package.json has no version');
if (typeof tauriConfig.version !== 'string') throw new Error('src-tauri/tauri.conf.json has no version');

packageJson.version = version;
tauriConfig.version = version;
const cargoToml = replaceCargoPackageVersion(cargoSource);

await Promise.all([
  writeFile(paths.package, `${JSON.stringify(packageJson, null, 2)}\n`),
  writeFile(paths.tauri, `${JSON.stringify(tauriConfig, null, 2)}\n`),
  writeFile(paths.cargo, cargoToml),
]);

console.log(`Updated application version to ${version}`);
