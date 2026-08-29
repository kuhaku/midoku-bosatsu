const FALLBACK_UPDATE_NOTES = 'リリースノートはありません。';
const UPDATE_NOTES_MAX_LENGTH = 240;
const UPDATE_FAILURE_MESSAGE = 'アップデートを完了できませんでした。アプリはそのまま利用できます。';

type UpdateResult = {
  version: string;
  body?: string | null;
  download: () => Promise<void>;
  install: () => Promise<void>;
};

type AppUpdateDependencies = {
  check: () => Promise<UpdateResult | null>;
  relaunch: () => Promise<void>;
  confirm: (message: string) => boolean;
  alert: (message: string) => void;
  logError: (error: unknown) => void;
};

type StartupUpdateSequenceDependencies = {
  runInitialFetch: () => Promise<void>;
  startReloadTimer: () => void;
  checkForAppUpdate: () => Promise<void>;
};

const defaultDependencies: AppUpdateDependencies = {
  check: async () => {
    const { check } = await import('@tauri-apps/plugin-updater');
    return check();
  },
  relaunch: async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    return relaunch();
  },
  confirm: (message) => window.confirm(message),
  alert: (message) => window.alert(message),
  logError: (error) => console.error(error),
};

let hasAttemptedCheck = false;
let inFlightCheck: Promise<void> | null = null;
let appUpdateDependencies: AppUpdateDependencies = defaultDependencies;

export function formatUpdateNotes(notes: string | null | undefined): string {
  const normalized = notes?.trim();
  if (!normalized) return FALLBACK_UPDATE_NOTES;
  if (normalized.length <= UPDATE_NOTES_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, UPDATE_NOTES_MAX_LENGTH)}…`;
}

export function createAppUpdateChecker(
  dependencies: AppUpdateDependencies,
): () => Promise<void> {
  let hasRun = false;
  let inFlight: Promise<void> | null = null;

  return async (): Promise<void> => {
    if (hasRun) return inFlight ?? Promise.resolve();
    if (inFlight) return inFlight;

    hasRun = true;
    inFlight = (async () => {
      try {
        const update = await dependencies.check();
        if (!update) return;

        const approved = dependencies.confirm(
          `新しいバージョン ${update.version} を利用できます。\n\n${formatUpdateNotes(update.body)}\n\n今すぐ更新して再起動しますか？`,
        );
        if (!approved) return;

        await update.download();
        await update.install();
        await dependencies.relaunch();
      } catch (error) {
        dependencies.logError(error);
        dependencies.alert(UPDATE_FAILURE_MESSAGE);
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };
}

function runConfiguredAppUpdateCheck(): Promise<void> {
  return createAppUpdateChecker(appUpdateDependencies)();
}

export function checkForAppUpdate(): Promise<void> {
  if (hasAttemptedCheck) return inFlightCheck ?? Promise.resolve();
  if (inFlightCheck) return inFlightCheck;

  hasAttemptedCheck = true;
  inFlightCheck = runConfiguredAppUpdateCheck().finally(() => {
    inFlightCheck = null;
  });
  return inFlightCheck;
}

export function createStartupUpdateSequence(
  dependencies: StartupUpdateSequenceDependencies,
): (hasEnabledSites: boolean) => Promise<void> {
  return async (hasEnabledSites): Promise<void> => {
    if (hasEnabledSites) {
      await dependencies.runInitialFetch();
      dependencies.startReloadTimer();
    }
    void dependencies.checkForAppUpdate();
  };
}

export function configureAppUpdateDependencies(
  dependencies: AppUpdateDependencies,
): void {
  appUpdateDependencies = dependencies;
}

export function resetAppUpdateStateForTests(): void {
  hasAttemptedCheck = false;
  inFlightCheck = null;
  appUpdateDependencies = defaultDependencies;
}
