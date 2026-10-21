import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dependencyPairs = [
  ['@tauri-apps/api', 'tauri'],
  ['@tauri-apps/cli', 'tauri'],
  ['@tauri-apps/plugin-dialog', 'tauri-plugin-dialog'],
  ['@tauri-apps/plugin-opener', 'tauri-plugin-opener'],
  ['@tauri-apps/plugin-process', 'tauri-plugin-process'],
  ['@tauri-apps/plugin-updater', 'tauri-plugin-updater'],
];

function readCargoDependencyVersion(source, dependency) {
  const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const dependencyLine = new RegExp(
    `^\\s*${escapedDependency}\\s*=\\s*(?:"([^"]+)"|\\{[^}]*\\bversion\\s*=\\s*"([^"]+)"[^}]*})\\s*(?:#.*)?$`,
    'm',
  );
  const match = source.match(dependencyLine);
  return match?.[1] ?? match?.[2];
}

function normalizeVersion(version, dependency) {
  if (typeof version !== 'string') return undefined;
  const match = version.match(/^[~^]?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  if (!match) throw new Error(`${dependency} has an unsupported version requirement: ${version}`);
  return match[1];
}

async function verifyTauriVersions(directory) {
  const [packageSource, cargoSource] = await Promise.all([
    readFile(resolve(directory, 'package.json'), 'utf8'),
    readFile(resolve(directory, 'src-tauri/Cargo.toml'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageSource);
  const npmDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const problems = [];
  for (const [npmDependency, cargoDependency] of dependencyPairs) {
    const npmVersion = npmDependencies[npmDependency];
    const cargoVersion = readCargoDependencyVersion(cargoSource, cargoDependency);

    if (npmVersion === undefined) {
      problems.push(`${npmDependency} is missing (paired with ${cargoDependency})`);
      continue;
    }
    if (cargoVersion === undefined) {
      problems.push(`${cargoDependency} is missing (paired with ${npmDependency})`);
      continue;
    }

    if (
      normalizeVersion(npmVersion, npmDependency)
      !== normalizeVersion(cargoVersion, cargoDependency)
    ) {
      problems.push(
        `${npmDependency}=${npmVersion}, ${cargoDependency}=${cargoVersion}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Tauri dependency versions do not agree:\n- ${problems.join('\n- ')}`);
  }
}

try {
  await verifyTauriVersions(process.cwd());
  console.log('Tauri dependency version check passed');
} catch (error) {
  console.error(
    `Tauri dependency version check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

export { dependencyPairs, normalizeVersion, readCargoDependencyVersion, verifyTauriVersions };
