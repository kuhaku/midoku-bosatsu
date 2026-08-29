import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function readCargoPackageVersion(source) {
  let inPackageSection = false;

  for (const line of source.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (section) {
      inPackageSection = section[1] === 'package';
      continue;
    }

    if (!inPackageSection) continue;
    const version = line.match(/^\s*version\s*=\s*"([^"]+)"\s*(?:#.*)?$/);
    if (version) return version[1];
  }

  throw new Error('src-tauri/Cargo.toml has no [package] version');
}

async function readReleaseVersions(directory) {
  const [packageSource, tauriSource, cargoSource] = await Promise.all([
    readFile(resolve(directory, 'package.json'), 'utf8'),
    readFile(resolve(directory, 'src-tauri/tauri.conf.json'), 'utf8'),
    readFile(resolve(directory, 'src-tauri/Cargo.toml'), 'utf8'),
  ]);

  return {
    'package.json': JSON.parse(packageSource).version,
    'src-tauri/tauri.conf.json': JSON.parse(tauriSource).version,
    'src-tauri/Cargo.toml': readCargoPackageVersion(cargoSource),
  };
}

async function verifyReleaseVersion(directory, refName) {
  if (!refName) throw new Error('GITHUB_REF_NAME is required');

  const versions = await readReleaseVersions(directory);
  const invalidEntry = Object.entries(versions).find(
    ([, version]) => typeof version !== 'string' || version.length === 0,
  );
  if (invalidEntry) throw new Error(`${invalidEntry[0]} has no version`);

  const entries = Object.entries(versions);
  const expectedVersion = entries[0][1];
  const mismatches = entries.filter(([, version]) => version !== expectedVersion);
  if (mismatches.length > 0) {
    const details = entries.map(([file, version]) => `${file}=${version}`).join(', ');
    throw new Error(`application versions must agree (${details})`);
  }

  const expectedRefName = `app-v${expectedVersion}`;
  if (refName !== expectedRefName) {
    throw new Error(`release tag ${refName} must equal ${expectedRefName}`);
  }

  return expectedVersion;
}

try {
  const version = await verifyReleaseVersion(process.cwd(), process.env.GITHUB_REF_NAME);
  console.log(`Release version check passed: app-v${version}`);
} catch (error) {
  console.error(`Release version check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

export { readCargoPackageVersion, readReleaseVersions, verifyReleaseVersion };
