// Exercise updater cache ownership and download failures without a device or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

module.exports = async function verifyUpdaterCache(root) {
  const files = new Map();
  let download = async file => { files.set(file.uri, 100); return file; };
  let listError = false;
  let cacheExists = true;
  let redirectUrl;
  const warnings = [];
  const application = { nativeApplicationVersion: '1.23.7' };
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
    'expo-file-system/legacy': {},
    'expo-intent-launcher': {},
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null } },
  };
  const module = { exports: {} };
  const filename = path.join(root, 'src/lib/updater.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports,
    require: name => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
    Error, URL, AbortController, setTimeout, clearTimeout,
    console: { warn: (...args) => warnings.push(args) },
    fetch: async (url, options) => {
      if (options?.method === 'HEAD') return { ok: true, status: 200, url: redirectUrl ?? url };
      throw new Error('Offline');
    },
  }, { filename });
  const updater = module.exports;
  const old = 'cache/Personal-Hub-1.9.99.apk';
  const installed = 'cache/Personal-Hub-1.23.7.apk';
  const pending = 'cache/Personal-Hub-1.23.8.apk';
  const protectedFiles = [pending, 'cache/personal-hub-backup-snapshot.json',
    'document/app_data.db', 'document/personal-hub-safety-backup.json',
    'cache/another-app.apk', 'cache/Personal-Hub-invalid.apk',
    'cache/subdirectory/Personal-Hub-1.0.0.apk'];
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
    downloadUrl: 'https://github.com/UranikSejdiu/Personal-Hub/releases/download/v1.23.8/app-release.apk' };
  for (const downloadUrl of [info.downloadUrl.replace('https:', 'http:'), info.downloadUrl.replace('github.com', 'github.com.evil.example'), info.downloadUrl.replace('Personal-Hub', 'Other-App')]) {
    await assert.rejects(updater.downloadApk({ ...info, downloadUrl }), /Invalid update metadata/);
  }
  await assert.rejects(updater.downloadApk({ ...info, versionCode: 1 }), /Invalid update metadata/);
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
  await updater.cleanupInstalledApks();
  assert.ok(files.has(pending));
  application.nativeApplicationVersion = '1.23.8';
  await updater.cleanupInstalledApks();
  assert.ok(!files.has(pending));
  return [{ name: 'Updater removes installed APKs offline, preserves pending installers and user files, cleans failed downloads, and serializes retries', passed: true }];
};
