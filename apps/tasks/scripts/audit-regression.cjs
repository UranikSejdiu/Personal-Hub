// Disposable SQLite exercises the actual standalone schema, backup IO, imports,
// rollback, recovery, and APK updater. No installed app data or network is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const identity = require('../src/appIdentity.json');
const fixture = require('./fixtures/hub-v7.json');
const sqlite = new DatabaseSync(':memory:');
const files = new Map();
let failSql = false, failDisk = false, folderCancelled = false, folderBroken = false;
let shared = null;
let openedName;
let preferenceFailure = false;
const scheduled = new Map();
class FakeFile {
  constructor(...parts) { this.uri = parts.map(p => p.uri || p).join('/'); }
  get name() { return this.uri.split('/').at(-1); }
  get exists() { return files.has(this.uri); }
  get size() { return Buffer.byteLength(files.get(this.uri) || ''); }
  write(value) { if (failDisk || (folderBroken && this.uri.startsWith('content://'))) throw new Error('Injected disk failure'); files.set(this.uri, value); }
  async text() { return files.get(this.uri); }
  move(target) { files.set(target.uri, files.get(this.uri)); files.delete(this.uri); }
  delete() { files.delete(this.uri); }
}
class FakeDirectory {
  constructor(uri) { this.uri = uri; }
  static async pickDirectoryAsync() { if (folderCancelled) throw Object.assign(new Error('Cancelled'), { code: 'ERR_PICKER_CANCELLED' }); return new FakeDirectory('content://backups'); }
  createFile(name, mime) { assert.equal(mime, 'application/json'); const file = new FakeFile(this, files.has(this.uri + "/" + name) ? "copy-" + files.size + "-" + name : name); files.set(file.uri, ''); return file; }
  list() { return [...files.keys()].filter(uri => uri.startsWith(this.uri + '/')).map(uri => new FakeFile(uri)); }
}
const connection = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, ...params) { if (failSql && sql.startsWith('INSERT INTO ')) throw new Error('Injected SQL failure'); const result = sqlite.prepare(sql).run(...params); return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) }; },
  async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
  async withTransactionAsync(fn) { sqlite.exec('BEGIN'); try { await fn(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } },
  async withExclusiveTransactionAsync(fn) { return this.withTransactionAsync(() => fn(this)); },
  async closeAsync() {},
};
const stored = new Map();
const native = {
  "@react-native-async-storage/async-storage": { __esModule: true, default: { getItem: async key => stored.get(key) ?? null, setItem: async (key,value) => { stored.set(key,value); } } },
  "expo-sqlite/kv-store": { __esModule: true, default: { getItemSync: key => stored.get(key) ?? null, setItemSync: (key,value) => { if (preferenceFailure) throw new Error('Preference disk unavailable'); stored.set(key,value); } } },
  "expo-secure-store": { getItem: () => null },
  'expo-sqlite': { openDatabaseAsync: async name => { openedName = name; return connection; } },
  'expo-file-system': { File: FakeFile, Directory: FakeDirectory, Paths: { cache: new FakeDirectory('cache'), document: new FakeDirectory('document') } },
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async uri => { shared = uri; } },
  'expo-application': { nativeApplicationVersion: '1.0.0' },
  'react-native': { Platform: { OS: 'android' } },
  'expo': { isRunningInExpoGo: () => false, requireOptionalNativeModule: name => name === 'ReminderAccess' ? { getStatus: () => ({ exactAlarms: true, batteryUnrestricted: false }) } : {} },
  'expo-intent-launcher': {},
  'expo-notifications': {
    AndroidImportance: { NONE: 0, DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: true }),
    getAllScheduledNotificationsAsync: async () => [...scheduled.values()],
    cancelScheduledNotificationAsync: async id => scheduled.delete(id),
    scheduleNotificationAsync: async request => { scheduled.set(request.identifier, request); return request.identifier; },
  },
};
const cache = new Map();
function load(file) {
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const requireMock = name => {
    if (name in native) return native[name];
    if (name.startsWith('.')) { const target = path.resolve(path.dirname(file), name); return load(fs.existsSync(target) ? target : target + '.ts'); }
    throw new Error('Unexpected native dependency ' + name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(requireMock, module, module.exports);
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
(async () => {
  const db = load(path.join(root, 'src/lib/db.ts'));
  const backup = load(path.join(root, 'src/lib/backup.ts'));
  await db.initDatabase();
  await db.initDatabase();
  assert.equal(openedName, identity.id + '_data');
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  for (const table of Object.values(identity.tables)) assert.ok(tables.includes(table));
  for (const table of ['dhikrs', 'tasks', 'notes', 'budgets']) if (!Object.values(identity.tables).includes(table)) assert.ok(!tables.includes(table), 'No unrelated module table: ' + table);
  const json = JSON.stringify(fixture);
  assert.ok(backup.previewBackup(json).length > 0);
  stored.set('haptics_enabled', 'legacy-value');
  await backup.importBackup(json);
  assert.equal(stored.get('haptics_enabled'), 'legacy-value', 'Legacy backups cannot reactivate tap vibration');
  assert.equal(JSON.stringify(fixture), json, 'Transfer never mutates the Hub backup');
  const original = plain(await backup.buildBackupEnvelope());
  assert.equal(original.preferences.theme, 'dark');
  assert.equal(original.preferences.haptics, undefined, 'Legacy vibration preferences do not return in new exports');
  assert.equal(original.preferences.notes?.viewMode, identity.id === 'notes' ? 'list' : undefined);
  stored.set('notes_preferences', 'malformed preference');
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), original.tables, 'A malformed display preference must not block backing up user records');
  await backup.importBackup(json);
  assert.deepEqual(Object.keys(original.tables), Object.keys(identity.tables));
  for (const key of Object.keys(identity.tables)) {
    const expected = fixture.tables[key];
    const result = original.tables[key];
    if (Array.isArray(expected)) {
      assert.equal(result.length, expected.length, key + ' count');
      for (const row of expected) {
        const actual = result.find(item => row.id !== undefined ? item.id === row.id : row.plan_id !== undefined ? item.plan_id === row.plan_id && item.month === row.month : item.month === row.month);
        assert.ok(actual, key + ' row');
        for (const [field, value] of Object.entries(row)) assert.deepEqual(actual[field], value, `${key}.${field} must survive exactly`);
      }
    } else if (expected) for (const [field, value] of Object.entries(expected)) assert.deepEqual(result[field], value);
  }
  if (identity.id === 'notes') assert.equal(db.isNotesFtsEnabled(), true);
  // Round trips preserve all stored fields, relationships, and ordering.
  await backup.importBackup(JSON.stringify(original));
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), original.tables);
  await backup.importBackup(json);
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), original.tables, 'Repeated migration replaces a snapshot without duplication');
  const uri = await backup.exportBackup();
  assert.equal(uri, shared);
  assert.equal(JSON.parse(files.get(shared)).meta.format, identity.backupFormat);
  assert.deepEqual(plain(backup.parseBackup(files.get(shared)).envelope.tables), plain(backup.parseBackup(JSON.stringify(original)).envelope.tables));
  const folder = await backup.exportBackupToDirectory();
  assert.ok(folder.startsWith('content://backups/' + identity.id + '-backup-'));
  assert.deepEqual(JSON.parse(files.get(folder)).tables, original.tables);
  folderCancelled = true; assert.equal(await backup.exportBackupToDirectory(), null); folderCancelled = false;
  folderBroken = true; await assert.rejects(backup.exportBackupToDirectory()); folderBroken = false;
  assert.ok([...files.entries()].every(([uri, data]) => !uri.startsWith('content://') || data !== ''), 'Failed provider writes leave no incomplete export');
  const before = plain((await backup.buildBackupEnvelope()).tables);
  failDisk = true; await assert.rejects(backup.importBackup(json)); failDisk = false;
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before, 'Safety file failure must abort before deletion');
  failSql = true; await assert.rejects(backup.importBackup(json)); failSql = false;
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before, 'Failed inserts roll back every deletion');
  await assert.rejects(backup.importBackup('{bad json'));
  const wrong = structuredClone(original); wrong.meta.format = 'uranik-other.backup';
  assert.throws(() => backup.parseBackup(JSON.stringify(wrong)));
  const missing = structuredClone(fixture); delete missing.tables[identity.id === "budget" ? "budgets" : Object.keys(identity.tables)[0]];
  assert.throws(() => backup.parseBackup(JSON.stringify(missing)));
  const malformed = structuredClone(original);
  const array = Object.values(malformed.tables).find(value => Array.isArray(value) && value.some(row => row.id !== undefined));
  array.push({ ...array.find(row => row.id !== undefined) });
  assert.throws(() => backup.parseBackup(JSON.stringify(malformed)), 'Duplicate IDs must be rejected before writing');
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before);
  preferenceFailure = true;
  const partial = await backup.importBackup(json);
  preferenceFailure = false;
  assert.equal(partial.preferencesRestored, false, 'Preference failures must be reported separately from a successful record import');
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before);
  // Legacy formats transfer only the module's historical fields; absent Tasks
  // tables must never be interpreted as an instruction to delete Tasks data.
  for (const version of [1, 3, 4, 5, 6, 7]) {
    const legacy = structuredClone(fixture); legacy.meta.version = version;
    if (version < 5) { delete legacy.tables.tasks; delete legacy.tables.taskLists; }
    if (version < 4) { delete legacy.tables.noteItems; legacy.tables.notes = legacy.tables.notes.filter(note => note.kind === 'text').map(({ is_archived, ...note }) => note); }
    if (version < 2) { delete legacy.tables.repaymentPlans; delete legacy.tables.repaymentPayments; }
    if (identity.id === 'tasks' && version < 5) assert.throws(() => backup.parseBackup(JSON.stringify(legacy)));
    else {
      await backup.importBackup(JSON.stringify(legacy));
      const exported = await backup.buildBackupEnvelope();
      backup.parseBackup(JSON.stringify(exported));
    }
  }
  await backup.importBackup(json);
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before);
  if (identity.id === 'tasks') {
    await require('./task-design-regression.cjs')(root, db, load(path.join(root, 'src/lib/tasks.ts')), backup, load);
    await require('./task-editor-regression.cjs')(root, load);
    await require('./task-screen-regression.cjs')(root, load);
    const reminders = load(path.join(root, 'src/lib/taskReminders.ts'));
    await reminders.syncTaskReminders('Task reminders');
    assert.equal(scheduled.size, 1, 'Imported reminder works in the standalone Tasks scheduler');
    assert.equal([...scheduled.values()][0].content.data.taskId, 92);
    const tasks = load(path.join(root, 'src/lib/tasks.ts'));
    for (let index = 0; index < 52; index++) await tasks.saveTask({ title: 'Future ' + index, notes: '', list_id: null, due_date: '2031-02-01', priority: 0, repeat: 'none', reminder_time: '09:00' });
    await reminders.syncTaskReminders('Task reminders');
    assert.equal(scheduled.size, 53, 'Android does not truncate the transferred reminder queue at 50');
    await backup.importBackup(json);
    await reminders.syncTaskReminders('Task reminders');
    assert.equal(scheduled.size, 1, 'Restoring cancels removed reminders');
  }
  const empty = structuredClone(original);
  for (const key of Object.keys(empty.tables)) empty.tables[key] = Array.isArray(empty.tables[key]) ? [] : null;
  await backup.importBackup(JSON.stringify(empty));
  assert.ok(Object.values((await backup.buildBackupEnvelope()).tables).every(value => value === null || value.length === 0));
  assert.equal(backup.hasSafetyBackup(), true);
  await backup.restoreSafetyBackup();
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before);
  // Another device / fresh install reads the exact JSON saved through the folder provider.
  await backup.importBackup(files.get(folder));
  assert.deepEqual(plain((await backup.buildBackupEnvelope()).tables), before);
  const expected = `${identity.tagPrefix}${require('../package.json').version}`;
  const { spawnSync } = require('node:child_process');
  assert.equal(spawnSync(process.execPath, ['scripts/check-release-tag.cjs'], { cwd: root, env: { ...process.env, RELEASE_TAG: expected }, encoding: 'utf8' }).status, 0);
  assert.notEqual(spawnSync(process.execPath, ['scripts/check-release-tag.cjs'], { cwd: root, env: { ...process.env, RELEASE_TAG: 'dhikr-v1.0.0' }, encoding: 'utf8' }).status, 0);
  await require('./updater-cache-regression.cjs')(root, { tagPrefix: identity.tagPrefix, apkPrefix: identity.title, packageId: identity.packageId });
  console.log(`Passed ${identity.title}: isolated schema, mixed Hub migration, exact record round trips, folder/share exports, cancellation, disk/SQL rollback, recovery, wrong-file rejection, release tag and APK update isolation.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sqlite.close());
