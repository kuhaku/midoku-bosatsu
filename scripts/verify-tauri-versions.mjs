import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

const dependencyPairs = [
  ['@tauri-apps/api', 'tauri'],
  ['@tauri-apps/cli', 'tauri'],
  ['@tauri-apps/plugin-dialog', 'tauri-plugin-dialog'],
  ['@tauri-apps/plugin-opener', 'tauri-plugin-opener'],
  ['@tauri-apps/plugin-process', 'tauri-plugin-process'],
  ['@tauri-apps/plugin-updater', 'tauri-plugin-updater'],
];

const dependencyGroups = [
  {
    npm: ['@tauri-apps/api', '@tauri-apps/cli'],
    cargo: ['tauri'],
  },
  ...dependencyPairs.slice(2).map(([npmDependency, cargoDependency]) => ({
    npm: [npmDependency],
    cargo: [cargoDependency],
  })),
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

function parseSemanticVersion(version) {
  const prereleaseSeparator = version.indexOf('-');
  const core = prereleaseSeparator === -1
    ? version
    : version.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1
    ? undefined
    : version.slice(prereleaseSeparator + 1);
  const [major, minor, patch] = core.split('.').map(Number);
  return {
    major,
    minor,
    patch,
    prerelease: prerelease?.split('.'),
  };
}

function compareSemanticVersions(left, right) {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);

  for (const part of ['major', 'minor', 'patch']) {
    const difference = leftVersion[part] - rightVersion[part];
    if (difference !== 0) return difference;
  }

  if (leftVersion.prerelease === undefined) {
    return rightVersion.prerelease === undefined ? 0 : 1;
  }
  if (rightVersion.prerelease === undefined) return -1;

  const identifierCount = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftIsNumeric = /^\d+$/.test(leftIdentifier);
    const rightIsNumeric = /^\d+$/.test(rightIdentifier);
    if (leftIsNumeric && rightIsNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }
    if (leftIsNumeric) return -1;
    if (rightIsNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }

  return 0;
}

function planTauriVersionUpdates(packageJson, cargoSource) {
  const npmDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };
  const problems = [];
  const changes = [];

  for (const group of dependencyGroups) {
    const entries = [
      ...group.npm.map((dependency) => ({
        manifest: 'package',
        dependency,
        currentRequirement: npmDependencies[dependency],
      })),
      ...group.cargo.map((dependency) => ({
        manifest: 'cargo',
        dependency,
        currentRequirement: readCargoDependencyVersion(cargoSource, dependency),
      })),
    ];

    let groupHasProblems = false;
    for (const entry of entries) {
      if (entry.currentRequirement === undefined) {
        problems.push(`${entry.dependency} is missing`);
        groupHasProblems = true;
        continue;
      }
      try {
        entry.version = normalizeVersion(entry.currentRequirement, entry.dependency);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
        groupHasProblems = true;
      }
    }
    if (groupHasProblems) continue;

    const targetVersion = entries
      .map((entry) => entry.version)
      .reduce((maximum, version) => (
        compareSemanticVersions(version, maximum) > 0 ? version : maximum
      ));

    for (const entry of entries) {
      if (entry.version === targetVersion) continue;
      changes.push({
        manifest: entry.manifest,
        dependency: entry.dependency,
        currentRequirement: entry.currentRequirement,
        targetVersion,
      });
    }
  }

  return { problems, changes };
}

async function promptForVersionSync(input, output) {
  output.write('Update to the greatest versions? [y/N] ');
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      return line.trim() === 'y';
    }
    return false;
  } finally {
    lines.close();
  }
}

function updatePackageManifest(packageJson, changes) {
  for (const change of changes.filter(({ manifest }) => manifest === 'package')) {
    const dependencySection = Object.hasOwn(packageJson.dependencies ?? {}, change.dependency)
      ? packageJson.dependencies
      : packageJson.devDependencies;
    const prefix = change.currentRequirement.match(/^[~^]/)?.[0] ?? '';
    dependencySection[change.dependency] = `${prefix}${change.targetVersion}`;
  }
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function updateCargoManifest(cargoSource, changes) {
  let updatedSource = cargoSource;
  for (const change of changes.filter(({ manifest }) => manifest === 'cargo')) {
    const escapedDependency = change.dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dependencyLine = new RegExp(
      `^\\s*${escapedDependency}\\s*=.*$`,
      'm',
    );
    updatedSource = updatedSource.replace(dependencyLine, (line) => {
      const dependencyValue = line.slice(line.indexOf('=') + 1).trimStart();
      if (dependencyValue.startsWith('"')) {
        return line.replace(/(=\s*")[^"]+"/, `$1${change.targetVersion}"`);
      }
      return line.replace(
        /(\bversion\s*=\s*")[^"]+"/,
        `$1${change.targetVersion}"`,
      );
    });
  }
  return updatedSource;
}

function buildNpmCommand(
  args,
  platform = process.platform,
  commandProcessor = process.env.ComSpec ?? 'cmd.exe',
) {
  if (platform === 'win32') {
    return {
      command: commandProcessor,
      args: ['/d', '/s', '/c', 'npm.cmd', ...args],
    };
  }
  return { command: 'npm', args };
}

function runPackageManagerCommand(command, args, cwd) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', rejectCommand);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveCommand();
        return;
      }
      rejectCommand(new Error(
        `${command} ${args.join(' ')} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
      ));
    });
  });
}

async function synchronizeTauriVersions(directory, options = {}) {
  const paths = {
    package: resolve(directory, 'package.json'),
    packageLock: resolve(directory, 'package-lock.json'),
    cargo: resolve(directory, 'src-tauri/Cargo.toml'),
    cargoLock: resolve(directory, 'src-tauri/Cargo.lock'),
  };
  const confirm = options.confirm ?? (async (changes) => {
    console.log('Tauri dependency version changes:');
    for (const change of changes) {
      console.log(`- ${change.dependency}: ${change.currentRequirement} -> ${change.targetVersion}`);
    }
    return promptForVersionSync(process.stdin, process.stdout);
  });
  const runCommand = options.runCommand ?? runPackageManagerCommand;
  const writeVersionFile = options.writeFile ?? writeFile;
  const [packageSource, packageLockSource, cargoSource, cargoLockSource] = await Promise.all([
    readFile(paths.package, 'utf8'),
    readFile(paths.packageLock, 'utf8'),
    readFile(paths.cargo, 'utf8'),
    readFile(paths.cargoLock, 'utf8'),
  ]);
  const packageJson = JSON.parse(packageSource);
  const plan = planTauriVersionUpdates(packageJson, cargoSource);

  if (plan.problems.length > 0) {
    throw new Error(`Tauri dependency version check failed:\n- ${plan.problems.join('\n- ')}`);
  }
  if (plan.changes.length === 0) return 'matched';
  if (!await confirm(plan.changes)) {
    let mismatchDetails;
    try {
      await verifyTauriVersions(directory);
    } catch (error) {
      mismatchDetails = error instanceof Error ? error.message : String(error);
    }
    throw new Error([
      mismatchDetails,
      'Tauri dependency version update declined',
    ].filter(Boolean).join('\n'));
  }

  try {
    await writeVersionFile(
      paths.package,
      updatePackageManifest(packageJson, plan.changes),
    );
    await writeVersionFile(
      paths.cargo,
      updateCargoManifest(cargoSource, plan.changes),
    );

    const npmCommand = buildNpmCommand([
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);
    await runCommand(npmCommand.command, npmCommand.args, directory);
    const cargoDirectory = join(directory, 'src-tauri');
    const cargoChanges = plan.changes.filter(({ manifest }) => manifest === 'cargo');
    for (const change of cargoChanges) {
      await runCommand(
        'cargo',
        ['update', '-p', change.dependency, '--precise', change.targetVersion],
        cargoDirectory,
      );
    }

    const [updatedPackageSource, updatedCargoSource] = await Promise.all([
      readFile(paths.package, 'utf8'),
      readFile(paths.cargo, 'utf8'),
    ]);
    const updatedPlan = planTauriVersionUpdates(
      JSON.parse(updatedPackageSource),
      updatedCargoSource,
    );
    if (updatedPlan.problems.length > 0 || updatedPlan.changes.length > 0) {
      throw new Error('Tauri dependency versions still do not agree after update');
    }
  } catch (updateError) {
    try {
      await Promise.all([
        writeVersionFile(paths.package, packageSource),
        writeVersionFile(paths.packageLock, packageLockSource),
        writeVersionFile(paths.cargo, cargoSource),
        writeVersionFile(paths.cargoLock, cargoLockSource),
      ]);
    } catch (restoreError) {
      throw new AggregateError(
        [updateError, restoreError],
        'Tauri dependency update failed and the original files could not be fully restored',
      );
    }
    throw updateError;
  }

  return 'updated';
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await synchronizeTauriVersions(process.cwd());
    console.log(result === 'updated'
      ? 'Tauri dependency versions updated successfully'
      : 'Tauri dependency version check passed');
  } catch (error) {
    console.error(
      `Tauri dependency version check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

export {
  buildNpmCommand,
  compareSemanticVersions,
  dependencyPairs,
  normalizeVersion,
  planTauriVersionUpdates,
  promptForVersionSync,
  readCargoDependencyVersion,
  synchronizeTauriVersions,
  verifyTauriVersions,
};
