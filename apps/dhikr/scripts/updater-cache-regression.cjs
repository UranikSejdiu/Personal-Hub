// Exercise updater cache ownership and download failures without a device or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

module.exports = async function verifyUpdaterCache(root, { tagPrefix = 'v', apkPrefix = 'Personal-Hub', packageId = 'com.uranik.offlinehub', dhikr = false } = {}) {
  const assetName = version => dhikr ? `Dhikr-${version}.apk` : 'app-release.apk';
  const assetUrl = version => `https://github.com/UranikSejdiu/Personal-Hub/releases/download/${tagPrefix}${version}/${assetName(version)}`;
  const files = new Map();
  let download = async file => { files.set(file.uri, 100); return file; };
  let listError = false;
  let cacheExists = true;
  let redirectUrl;
  const warnings = [];
  const application = { nativeApplicationVersion: '1.23.7', applicationId: packageId };
  const stored = new Map();
  const timers = new Map();
  let timerId = 0;
  let api = async () => { throw new Error('Offline'); };
  const intents = [];
  const platform = { OS: 'android' };
  class FakeFile {
    constructor(...parts) { this.uri = parts.map(part => part.uri || part).join('/'); }
    get name() { return this.uri.split('/').pop(); }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri) || 0; }
    delete() { files.delete(this.uri); }
    static createDownloadTask(_url, file) { return { downloadAsync: () => download(file) }; }
  }
  const cache = {
    uri: 'cache',
    get exists() { return cacheExists; },
    list() {
      if (listError) throw new Error('Cache unavailable');
      return [...files.keys()].filter(uri => /^cache\/[^/]+$/.test(uri))
        .map(uri => new FakeFile(uri)).concat({ name: 'Personal-Hub-1.0.0.apk' });
    },
  };
  const mocks = {
    'react-native': { Platform: platform },
    'expo-application': application,
    'expo-file-system': { File: FakeFile, Paths: { cache } },
    'expo-file-system/legacy': { getContentUriAsync: async uri => `content://installer/${uri}` },
    'expo-intent-launcher': { startActivityAsync: async (...args) => { intents.push(args); } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => stored.get(key) ?? null,
      setItem: async (key, value) => { stored.set(key, value); },
    } },
  };
  const module = { exports: {} };
  const filename = path.join(root, 'src/lib/updater.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: name => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
    Error, URL, AbortController,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    console: { warn: (...args) => warnings.push(args) },
    fetch: async (url, options) => {
      if (options?.method === 'HEAD') return { ok: true, status: 200, url: redirectUrl ?? url };
      return api(url, options);
    },
  }, { filename });
  const updater = module.exports;
  const old = `cache/${apkPrefix}-1.9.99.apk`;
  const installed = `cache/${apkPrefix}-1.23.7.apk`;
  const pending = `cache/${apkPrefix}-1.23.8.apk`;
  const protectedFiles = [pending, 'cache/personal-hub-backup-snapshot.json',
    'document/app_data.db', 'document/personal-hub-safety-backup.json',
    'cache/another-app.apk', `cache/${apkPrefix}-invalid.apk`,
    `cache/subdirectory/${apkPrefix}-1.0.0.apk`];
  for (const uri of [old, installed, ...protectedFiles]) files.set(uri, 100);
  const result = await updater.checkForUpdate();
  assert.equal(result.status, 'error');
  assert.ok(!files.has(old) && !files.has(installed));
  for (const uri of protectedFiles) assert.ok(files.has(uri), `Must preserve ${uri}`);

  files.set(old, 100);
  application.nativeApplicationVersion = null;
  await updater.cleanupInstalledApks();
  assert.ok(files.has(old));
  application.nativeApplicationVersion = '1.23.7';
  platform.OS = 'ios';
  await updater.cleanupInstalledApks();
  assert.ok(files.has(old));
  platform.OS = 'android';
  cacheExists = false;
  await updater.cleanupInstalledApks();
  cacheExists = true;
  listError = true;
  assert.equal((await updater.checkForUpdate()).status, 'error');
  assert.ok(warnings.some(args => args[0].includes('installed APK cleanup failed')));
  listError = false;
  files.clear();
  await updater.cleanupInstalledApks();

  const info = { versionName: '1.23.8', versionCode: 1023008, body: '',
    downloadUrl: assetUrl('1.23.8') };
  for (const downloadUrl of [info.downloadUrl.replace('https:', 'http:'), info.downloadUrl.replace('github.com', 'github.com.evil.example'), info.downloadUrl.replace('Personal-Hub', 'Other-App')]) {
    await assert.rejects(updater.downloadApk({ ...info, downloadUrl }), /Invalid update metadata/);
  }
  await assert.rejects(updater.downloadApk({ ...info, versionCode: 1 }), /Invalid update metadata/);
  application.applicationId = 'com.other.app';
  await assert.rejects(updater.downloadApk(info), /different app/);
  application.applicationId = packageId;
  redirectUrl = 'https://evil.example/app-release.apk';
  await assert.rejects(updater.downloadApk(info), /unexpected host/);
  redirectUrl = undefined;
  download = async file => { files.set(file.uri, 50); throw new Error('Disconnected'); };
  await assert.rejects(updater.downloadApk(info), /Download failed: Disconnected/);
  assert.ok(!files.has(pending));
  download = async file => { files.set(file.uri, 0); return file; };
  await assert.rejects(updater.downloadApk(info), /Empty APK/);
  assert.ok(!files.has(pending));

  let finishDownload;
  download = file => new Promise(resolve => {
    finishDownload = () => { files.set(file.uri, 100); resolve(file); };
  });
  const first = updater.downloadApk(info);
  await assert.rejects(updater.downloadApk(info), /already in progress/);
  assert.ok(finishDownload);
  finishDownload();
  assert.equal((await first).uri, pending);
  await updater.installApk(new FakeFile(pending));
  assert.equal(intents.at(-1)[0], 'android.intent.action.VIEW');
  assert.equal(intents.at(-1)[1].type, 'application/vnd.android.package-archive');
  await updater.openInstallSettings();
  assert.equal(intents.at(-1)[1].data, `package:${packageId}`);
  await updater.cleanupInstalledApks();
  assert.ok(files.has(pending));
  application.nativeApplicationVersion = '1.23.8';
  await updater.cleanupInstalledApks();
  assert.ok(!files.has(pending));

  application.nativeApplicationVersion = '1.23.7';
  const release = (version, extra = {}) => ({ tag_name: `${tagPrefix}${version}`, draft: false, prerelease: false, body: 'Release notes',
    assets: [{ name: assetName(version), browser_download_url: assetUrl(version) }], ...extra });
  const response = data => ({ status: 200, text: async () => JSON.stringify(data) });
  const other = { tag_name: dhikr ? 'v99.0.0' : 'dhikr-v99.0.0', draft: false, prerelease: false, assets: [] };
  api = async (url, options) => {
    assert.match(url, /\/releases\?per_page=100&page=1$/);
    assert.equal(options.headers['Cache-Control'], 'no-cache');
    return response([other, release('1.23.8'), release('1.23.10'), release('1.23.9'),
      release('99.0.0', { draft: true }), release('98.0.0', { prerelease: true }),
      release('1.24.0', { assets: [] }), release('1.25.0-beta')]);
  };
  const fresh = await updater.checkForUpdate();
  assert.equal(fresh.status, 'update');
  assert.equal(fresh.latest.versionName, '1.23.10');
  assert.equal(fresh.latest.downloadUrl, assetUrl('1.23.10'));
  assert.ok(fresh.checkedAt > 0);
  assert.equal(timers.size, 0);

  // Offline and throttled checks must never masquerade as current results.
  api = async () => { throw new Error('Offline'); };
  const offline = await updater.checkForUpdate();
  assert.equal(offline.status, 'error');
  assert.equal(offline.cachedLatest.versionName, '1.23.10');
  assert.equal(offline.checkedAt, fresh.checkedAt);
  api = async () => ({ status: 429 });
  assert.equal((await updater.checkForUpdate()).status, 'error');
  application.nativeApplicationVersion = '1.23.10';
  assert.equal((await updater.checkForUpdate()).cachedLatest, undefined);
  api = async () => response([release('1.23.10')]);
  assert.equal((await updater.checkForUpdate()).status, 'up-to-date');
  api = async () => { throw new Error('Offline'); };
  assert.equal((await updater.checkForUpdate()).status, 'error');
  assert.equal((await updater.checkForUpdate()).cachedLatest, undefined);
  application.nativeApplicationVersion = '1.23.7';
  stored.clear();
  api = async () => response([release('1.23.10')]);
  await updater.checkForUpdate();
  const cacheKey = [...stored.keys()][0];
  const expired = JSON.parse(stored.get(cacheKey));
  expired.checkedAt = Date.now() - 25 * 60 * 60 * 1000;
  stored.set(cacheKey, JSON.stringify(expired));
  api = async () => { throw new Error('Offline'); };
  assert.equal((await updater.checkForUpdate()).cachedLatest, undefined);
  stored.clear();

  // A matching release on a later page must not be hidden by the other app.
  let pages = [];
  api = async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    pages.push(page);
    return response(page === 1 ? Array(100).fill(other) : [release('1.23.11')]);
  };
  assert.equal((await updater.checkForUpdate()).latest.versionName, '1.23.11');
  assert.deepEqual(pages, [1, 2]);
  stored.clear();
  api = async url => new URL(url).searchParams.get('page') === '1'
    ? response(Array(100).fill(other)) : { status: 500 };
  assert.equal((await updater.checkForUpdate()).status, 'error');
  api = async () => response([other]);
  assert.equal((await updater.checkForUpdate()).status, 'no-releases');
  api = async () => ({ status: 404 });
  assert.equal((await updater.checkForUpdate()).status, 'error');
  for (const bad of [{ message: 'not an array' }, [release('1.23.8', { assets: [{ name: assetName('1.23.8'), browser_download_url: 'https://evil.example/app.apk' }] })]]) {
    api = async () => response(bad);
    assert.equal((await updater.checkForUpdate()).status, 'error');
  }

  // Compare semantic components rather than a weighted number that collides.
  application.nativeApplicationVersion = '1.1000.0';
  api = async () => response([release('2.0.0')]);
  assert.equal((await updater.checkForUpdate()).status, 'update');
  api = async () => response([release('1.999.999')]);
  assert.equal((await updater.checkForUpdate()).status, 'up-to-date');
  application.nativeApplicationVersion = '1.23.7';

  let endResponse;
  let calls = 0;
  api = async () => { calls++; return new Promise(resolve => { endResponse = () => resolve(response([])); }); };
  const firstCheck = updater.checkForUpdate();
  const secondCheck = updater.checkForUpdate();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  endResponse();
  assert.equal((await firstCheck).status, 'no-releases');
  assert.equal((await secondCheck).status, 'no-releases');

  stored.clear();
  let bodyStarted;
  const readingBody = new Promise(resolve => { bodyStarted = resolve; });
  api = async (_url, options) => ({ status: 200, text: () => {
    bodyStarted();
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timed out'))));
  } });
  const timeoutCheck = updater.checkForUpdate();
  await readingBody;
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal((await timeoutCheck).status, 'error');
  assert.equal(timers.size, 0);

  return [
    { name: 'Updater removes installed APKs offline, preserves pending installers and user files, cleans failed downloads, and serializes retries', passed: true },
    { name: `${apkPrefix} updates isolate releases, compare versions, page history, report failed checks, expire caches, deduplicate checks, and time out response bodies`, passed: true },
  ];
};
