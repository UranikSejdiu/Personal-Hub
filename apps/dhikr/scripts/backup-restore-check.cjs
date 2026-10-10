// Test preference migration and generated Android backup rules without a device.
/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { parseStringPromise } = require('xml2js');
const root = path.resolve(__dirname, '..');

function loadPreferences() {
  const portable = new Map();
  const legacy = new Map();
  let legacyRead = async key => legacy.get(key) ?? null;
  let failWrite = false;
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/preferences.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})')(
    name => {
      if (name === 'expo-sqlite/kv-store') return { __esModule: true, default: {
        getItemSync: key => portable.get(key) ?? null,
        setItemSync: (key, value) => {
          if (failWrite) throw new Error('Disk full');
          portable.set(key, value);
        },
      } };
      if (name === 'expo-secure-store') return {
        getItem: key => legacy.get(key) ?? null,
        getItemAsync: key => legacyRead(key),
      };
      throw new Error('Unexpected dependency: ' + name);
    }, module, module.exports);
  return {
    ...module.exports, portable, legacy,
    setLegacyRead: fn => { legacyRead = fn; },
    failWrites: () => { failWrite = true; },
  };
}

async function checkPreferences() {
  const prefs = loadPreferences();
  prefs.legacy.set('app_theme', 'tawheed');
  prefs.legacy.set('haptics_enabled', 'false');
  assert.equal(prefs.getPreferenceSync('app_theme'), 'dark');
  assert.equal(prefs.portable.size, 0, 'Theme initialization must not migrate during render');
  assert.equal(await prefs.getPreference('app_theme'), 'dark');
  assert.equal(await prefs.getPreference('haptics_enabled'), 'false');
  assert.equal(prefs.portable.get('app_theme'), 'dark');
  assert.equal(prefs.portable.get('haptics_enabled'), 'false');
  if (require(path.join(root, 'package.json')).name !== 'dhikr') {
    for (const [key, value] of [
      ['app_has_seen_tutorial', 'true'],
      ['app_sample_data_state', JSON.stringify({ state: 'seeded', months: ['2026-09'], noteIds: [1] })],
    ]) {
      prefs.legacy.set(key, value);
      assert.equal(await prefs.getPreference(key), value);
      prefs.legacy.delete(key);
      assert.equal(await prefs.getPreference(key), value, 'Restored setup state must survive without SecureStore');
    }
  }
  // A restored installation has portable preferences but no old keystore.
  prefs.legacy.clear();
  prefs.setLegacyRead(async () => { throw new Error('Keystore not available'); });
  assert.equal(prefs.getPreferenceSync('app_theme'), 'dark');
  assert.equal(await prefs.getPreference('haptics_enabled'), 'false');
  assert.equal(await prefs.getPreference('haptics_enabled'), 'false');
  const emptyRestore = loadPreferences();
  emptyRestore.setLegacyRead(async () => { throw new Error('Keystore not available'); });
  assert.equal(await emptyRestore.getPreference('app_theme'), null);
  assert.equal(emptyRestore.portable.size, 0);

  const race = loadPreferences();
  let releaseRead;
  race.setLegacyRead(() => new Promise(resolve => { releaseRead = resolve; }));
  const pending = race.getPreference('app_theme');
  await race.setPreference('app_theme', 'light');
  releaseRead('dark');
  assert.equal(await pending, 'light', 'Legacy migration must not replace a newer preference');
  assert.equal(race.portable.get('app_theme'), 'light');
  race.failWrites();
  await assert.rejects(race.setPreference('app_theme', 'dark'), /Disk full/);
  assert.equal(race.portable.get('app_theme'), 'light');
}

async function checkBackupRules() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'android-backup-rules-'));
  try {
    let writeRules, modifyManifest;
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(root, 'plugins/withAndroidBackupRules.js'), 'utf8');
    vm.runInThisContext('(function(require,module,exports){' + source + '\n})')(
      name => name === 'expo/config-plugins' ? {
        withDangerousMod: (config, [platform, mod]) => {
          assert.equal(platform, 'android');
          writeRules = mod;
          return config;
        },
        withAndroidManifest: (config, mod) => { modifyManifest = mod; return config; },
      } : require(name), module, module.exports);
    module.exports({});
    await writeRules({ modRequest: { projectRoot: temp } });
    const manifest = { manifest: { application: [{ $: { 'android:allowBackup': 'false' } }] } };
    modifyManifest({ modResults: manifest });
    assert.equal(manifest.manifest.application[0].$['android:allowBackup'], 'true');
    assert.equal(manifest.manifest.application[0].$['android:fullBackupContent'], '@xml/backup_rules');
    assert.equal(manifest.manifest.application[0].$['android:dataExtractionRules'], '@xml/data_extraction_rules');
    const directory = path.join(temp, 'android/app/src/main/res/xml');
    const legacy = await parseStringPromise(fs.readFileSync(path.join(directory, 'backup_rules.xml')));
    const modern = await parseStringPromise(fs.readFileSync(path.join(directory, 'data_extraction_rules.xml')));
    const blocks = [legacy['full-backup-content'],
      modern['data-extraction-rules']['cloud-backup'][0],
      modern['data-extraction-rules']['device-transfer'][0]];
    const safety = require(path.join(root, 'package.json')).name === 'dhikr'
      ? 'dhikr-safety-backup.json' : 'personal-hub-safety-backup.json';
    function covered(entries, domain, name) {
      return (entries || []).some(({ $: rule }) => rule.domain === domain &&
        (rule.path === '.' || name === rule.path ||
         (rule.path.endsWith('/') && name.startsWith(rule.path))));
    }
    function eligible(block, domain, name) {
      return covered(block.include, domain, name) && !covered(block.exclude, domain, name);
    }
    for (const block of blocks) {
      for (const filename of ['SQLite/app_data', 'SQLite/dhikr_data', 'SQLite/ExpoSQLiteStorage',
        'SQLite/app_data-wal', 'SQLite/dhikr_data-shm']) {
        assert(eligible(block, 'file', filename), filename + ' must participate in backup');
      }
      assert(eligible(block, 'database', 'RKStorage'), 'AsyncStorage preferences must be transferable');
      assert(eligible(block, 'file', safety), 'Recovery copy must remain available after restore');
      assert(!eligible(block, 'file', safety + '.tmp'));
      assert(!eligible(block, 'file', 'downloaded-update.apk'));
      assert(!eligible(block, 'sharedpref', 'SecureStore'));
      assert(!eligible(block, 'sharedpref', 'SecureStore.xml'));
      assert(block.exclude.some(e => e.$.domain === 'sharedpref' && e.$.path === 'SecureStore'));
    }
  } finally {
    // Delete only the directory created above, inside the OS temporary directory.
    assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

(async () => {
  await checkPreferences();
  await checkBackupRules();
  console.log('Passed: preference migration, restore without keystore, concurrent setting changes, write failures, and Android cloud/device-transfer eligibility.');
})().catch(error => { console.error(error); process.exitCode = 1; });
