import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkForManualAppUpdate,
  checkForAppUpdate,
  configureAppUpdateDependencies,
  createAppUpdateChecker,
  createStartupUpdateSequence,
  installAppUpdate,
  formatUpdateNotes,
  resetAppUpdateStateForTests,
} from './app_updates.ts';

test.afterEach(() => {
  resetAppUpdateStateForTests();
});

test('formatUpdateNotesは空文字のときフォールバック文言を返す', () => {
  assert.equal(formatUpdateNotes(''), 'リリースノートはありません。');
  assert.equal(formatUpdateNotes('   '), 'リリースノートはありません。');
  assert.equal(formatUpdateNotes(null), 'リリースノートはありません。');
  assert.equal(formatUpdateNotes(undefined), 'リリースノートはありません。');
});

test('formatUpdateNotesは非空のノートを保持しつつ長文を省略する', () => {
  assert.equal(formatUpdateNotes('軽微な修正を含みます。'), '軽微な修正を含みます。');

  const longNotes = '更新内容'.repeat(80);
  const formatted = formatUpdateNotes(longNotes);

  assert.ok(formatted.startsWith('更新内容更新内容'));
  assert.ok(formatted.endsWith('…'));
  assert.ok(formatted.length < longNotes.length);
  assert.ok(formatted.length <= 241);
});

test('checkForAppUpdateは確認中と完了後の両方で一度しか走らない', async () => {
  let releaseCheck;
  const checkCalls = [];

  configureAppUpdateDependencies({
    check: () => {
      checkCalls.push('check');
      return new Promise((resolve) => {
        releaseCheck = () => resolve(null);
      });
    },
    relaunch: async () => {
      throw new Error('relaunch should not run');
    },
    confirm: () => false,
    alert: () => {
      throw new Error('alert should not run');
    },
    logError: () => {
      throw new Error('logError should not run');
    },
  });

  const firstRun = checkForAppUpdate();
  const secondRun = checkForAppUpdate();

  assert.equal(checkCalls.length, 1);

  releaseCheck();
  await Promise.all([firstRun, secondRun]);

  await checkForAppUpdate();

  assert.equal(checkCalls.length, 1);
});

test('手動の更新確認は起動時の確認後でも毎回最新の更新情報を取得する', async () => {
  const updates = [
    null,
    { version: '0.2.2', date: '2026-08-30T00:00:00Z', body: null, download: async () => {}, install: async () => {} },
    null,
  ];
  configureAppUpdateDependencies({
    check: async () => updates.shift(),
    relaunch: async () => {},
    confirm: () => false,
    alert: () => {},
    logError: () => {},
  });

  await checkForAppUpdate();
  const availableUpdate = await checkForManualAppUpdate();
  const noUpdate = await checkForManualAppUpdate();

  assert.equal(availableUpdate?.version, '0.2.2');
  assert.equal(availableUpdate?.date, '2026-08-30T00:00:00Z');
  assert.equal(noUpdate, null);
});

test('手動で選んだ更新はダウンロード、インストール、再起動の順で適用する', async () => {
  const events = [];
  await installAppUpdate({
    version: '0.2.2',
    date: '2026-08-30T00:00:00Z',
    body: null,
    download: async () => events.push('download'),
    install: async () => events.push('install'),
  }, {
    relaunch: async () => events.push('relaunch'),
  });

  assert.deepEqual(events, ['download', 'install', 'relaunch']);
});

test('更新がある場合はバージョンとリリースノートを確認文へ表示する', async () => {
  const messages = [];
  const checker = createAppUpdateChecker({
    check: async () => ({
      version: '0.2.0',
      body: '重要な修正です。',
      download: async () => {},
      install: async () => {},
    }),
    relaunch: async () => {},
    confirm: (message) => {
      messages.push(message);
      return false;
    },
    alert: () => {},
    logError: () => {},
  });

  await checker();

  assert.equal(messages.length, 1);
  assert.match(messages[0], /0\.2\.0/);
  assert.match(messages[0], /重要な修正です。/);
});

test('更新をキャンセルするとダウンロード、インストール、再起動を行わない', async () => {
  const events = [];
  const checker = createAppUpdateChecker({
    check: async () => ({
      version: '0.2.0',
      body: null,
      download: async () => events.push('download'),
      install: async () => events.push('install'),
    }),
    relaunch: async () => events.push('relaunch'),
    confirm: () => {
      events.push('confirm');
      return false;
    },
    alert: () => events.push('alert'),
    logError: () => events.push('logError'),
  });

  await checker();

  assert.deepEqual(events, ['confirm']);
});

test('承認すると確認、ダウンロード、インストール、再起動の順で実行する', async () => {
  const events = [];
  const checker = createAppUpdateChecker({
    check: async () => {
      events.push('check');
      return {
        version: '0.2.0',
        body: null,
        download: async () => events.push('download'),
        install: async () => events.push('install'),
      };
    },
    relaunch: async () => events.push('relaunch'),
    confirm: () => {
      events.push('confirm');
      return true;
    },
    alert: () => events.push('alert'),
    logError: () => events.push('logError'),
  });

  await checker();

  assert.deepEqual(events, ['check', 'confirm', 'download', 'install', 'relaunch']);
});

for (const failingStage of ['check', 'download', 'install', 'relaunch']) {
  test(`${failingStage}失敗時はエラーを記録し、継続利用できる警告を表示する`, async () => {
    const expectedError = new Error(`${failingStage} failed`);
    const alerts = [];
    const loggedErrors = [];
    const events = [];
    const failAt = async (stage) => {
      events.push(stage);
      if (stage === failingStage) throw expectedError;
    };
    const checker = createAppUpdateChecker({
      check: async () => {
        await failAt('check');
        return {
          version: '0.2.0',
          body: null,
          download: () => failAt('download'),
          install: () => failAt('install'),
        };
      },
      relaunch: () => failAt('relaunch'),
      confirm: () => true,
      alert: (message) => alerts.push(message),
      logError: (error) => loggedErrors.push(error),
    });

    await checker();

    assert.deepEqual(loggedErrors, [expectedError]);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /アプリはそのまま利用できます/);
    assert.deepEqual(
      events,
      ['check', 'download', 'install', 'relaunch'].slice(0, ['check', 'download', 'install', 'relaunch'].indexOf(failingStage) + 1),
    );
  });
}

test('startup updater sequenceは初回フェッチ完了後に更新確認を開始し、その完了を待たない', async () => {
  const events = [];
  let finishFetch;
  let finishUpdate;

  const runStartupUpdateSequence = createStartupUpdateSequence({
    runInitialFetch: () => new Promise((resolve) => {
      events.push('fetch:start');
      finishFetch = () => {
        events.push('fetch:end');
        resolve();
      };
    }),
    startReloadTimer: () => {
      events.push('reload:start');
    },
    checkForAppUpdate: () => new Promise((resolve) => {
      events.push('update:start');
      finishUpdate = () => {
        events.push('update:end');
        resolve();
      };
    }),
  });

  const startupRun = runStartupUpdateSequence(true);
  await Promise.resolve();

  assert.deepEqual(events, ['fetch:start']);

  finishFetch();
  await startupRun;

  assert.deepEqual(events, ['fetch:start', 'fetch:end', 'reload:start', 'update:start']);

  finishUpdate();
  await Promise.resolve();

  assert.deepEqual(events, ['fetch:start', 'fetch:end', 'reload:start', 'update:start', 'update:end']);
});

test('有効なBBSが0件でも取得とタイマーを飛ばして更新確認を開始する', async () => {
  const events = [];
  const runStartupUpdateSequence = createStartupUpdateSequence({
    runInitialFetch: async () => events.push('fetch'),
    startReloadTimer: () => events.push('reload:start'),
    checkForAppUpdate: async () => {
      events.push('update:start');
    },
  });

  await runStartupUpdateSequence(false);
  await Promise.resolve();

  assert.deepEqual(events, ['update:start']);
});
