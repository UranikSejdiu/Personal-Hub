// Execute the actual database/domain/backup modules against disposable SQLite
// and file fixtures. No installed app or personal records are accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sqlite = new DatabaseSync(':memory:');
const files = new Map();
const stored = new Map();
let failSql = null;
let failFileWrite = false;
let exportsShared = 0;
let folderPickerError = null;
let folderWriteError = null;
let folderCreateError = null;
let folderMimeType = null;
let rolloverWrites = 0;

class FakeFile {
  constructor(...parts) { this.uri = parts.map(p => typeof p === 'string' ? p : p.uri).join('/'); }
  get exists() { return files.has(this.uri); }
  get size() { return Buffer.byteLength(files.get(this.uri) || ''); }
  write(text) {
    if (this.uri.startsWith('content://') && folderWriteError) {
      files.set(this.uri, 'partial');
      throw folderWriteError;
    }
    if (failFileWrite) throw new Error('Injected disk failure');
    files.set(this.uri, text);
  }
  async text() { return files.get(this.uri); }
  move(target) { files.set(target.uri, files.get(this.uri)); files.delete(this.uri); }
  delete() { files.delete(this.uri); }
}

class FakeDirectory {
  constructor(uri) { this.uri = uri; }
  static async pickDirectoryAsync() {
    if (folderPickerError) throw folderPickerError;
    return new FakeDirectory('content://backups');
  }
  createFile(name, mimeType) {
    if (folderCreateError) throw folderCreateError;
    folderMimeType = mimeType;
    const file = new FakeFile(this, name);
    files.set(file.uri, '');
    return file;
  }
}

const nativeConnection = {
  async execAsync(sql) { sqlite.exec(sql); },
  async runAsync(sql, ...params) {
    if (sql.startsWith('UPDATE dhikrs SET daily_count = 0, last_reset_date =')) rolloverWrites++;
    if (failSql && failSql(sql, params)) throw new Error('Injected SQL failure');
    const result = sqlite.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  },
  async getAllAsync(sql, ...params) { return sqlite.prepare(sql).all(...params); },
  async getFirstAsync(sql, ...params) { return sqlite.prepare(sql).get(...params) ?? null; },
  async withTransactionAsync(fn) {
    sqlite.exec('BEGIN');
    try { await fn(); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
  async withExclusiveTransactionAsync(fn) {
    await this.withTransactionAsync(() => fn(this));
  },
  async closeAsync() {},
};

const mocks = {
  'expo-sqlite': { openDatabaseAsync: async name => {
    assert.equal(name, 'dhikr_data');
    return nativeConnection;
  } },
  'expo-file-system': { File: FakeFile, Directory: FakeDirectory, Paths: { document: 'document', cache: 'cache' } },
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => { exportsShared++; } },
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async key => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async key => { stored.delete(key); },
  } },
};
const modules = new Map();
function load(file) {
  const filename = path.resolve(root, file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name + '.ts'));
    throw new Error('Unexpected native dependency: ' + name);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}

async function main() {
  const db = load('src/lib/db.ts');
  const dhikr = load('src/lib/dhikr.ts');
  const backup = load('src/lib/backup.ts');
  await db.initDatabase();
  assert.deepEqual(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name), ['dhikrs']);

  const first = await dhikr.addDhikr('Istighfar', 10);
  await Promise.all(Array.from({ length: 50 }, () => dhikr.incrementDhikr(first.id)));
  assert.equal((await dhikr.loadDhikrs())[0].total_count, 10);
  assert.equal((await dhikr.loadDhikrs())[0].daily_count, 10);
  const rolloverBefore = rolloverWrites;
  for (let i = 0; i < 100; i++) await dhikr.loadDhikrs();
  assert.equal(rolloverWrites, rolloverBefore, 'Same-day list refreshes must not issue no-op updates');
  await db.execute("UPDATE dhikrs SET last_reset_date = '2000-01-01' WHERE id = ?", [first.id]);
  assert.equal(await dhikr.incrementDhikr(first.id), true);
  assert.equal((await dhikr.loadDhikrs())[0].total_count, 11);
  assert.equal((await dhikr.loadDhikrs())[0].daily_count, 1);
  await dhikr.updateDhikr(first.id, { total_count: 42 });
  await assert.rejects(dhikr.updateDhikr(first.id, { total_count: -1 }), RangeError);
  assert.equal((await dhikr.loadDhikrs())[0].total_count, 42);
  const second = await dhikr.addDhikr('Second', null);
  await dhikr.reorderDhikrs([second.id, first.id]);
  assert.deepEqual((await dhikr.loadDhikrs()).map(row => row.id), [second.id, first.id]);

  // Imported/edited maximum counts must remain safe and exportable after taps.
  await dhikr.updateDhikr(second.id, { total_count: Number.MAX_SAFE_INTEGER - 1 });
  assert.equal(await dhikr.incrementDhikr(second.id), true);
  assert.equal(await dhikr.incrementDhikr(second.id), false);
  assert.equal((await dhikr.loadDhikrs()).find(row => row.id === second.id).total_count, Number.MAX_SAFE_INTEGER);
  await dhikr.updateDhikr(second.id, { total_count: 0 });
  await db.execute('UPDATE dhikrs SET daily_count = ?, last_reset_date = ? WHERE id = ?', [Number.MAX_SAFE_INTEGER, dhikr.todayDate(), second.id]);
  assert.equal(await dhikr.incrementDhikr(second.id), false);
  await db.execute("UPDATE dhikrs SET last_reset_date = '2000-01-01' WHERE id = ?", [second.id]);
  assert.equal(await dhikr.incrementDhikr(second.id), true, 'A new day resets a maximum daily count');
  await dhikr.resetDhikr(second.id);

  // A failed transaction cannot capture and discard an unrelated queued write.
  const failed = db.withTransaction(async tx => {
    await tx.execute('UPDATE dhikrs SET total_count = 999 WHERE id = ?', [first.id]);
    throw new Error('Rollback');
  });
  const incremented = dhikr.incrementDhikr(first.id);
  await assert.rejects(failed, /Rollback/);
  assert.equal(await incremented, true);
  assert.equal((await dhikr.loadDhikrs()).find(row => row.id === first.id).total_count, 43);

  const before = await db.query('SELECT * FROM dhikrs ORDER BY id');
  const folderUri = await backup.exportBackupToDirectory();
  assert.match(folderUri, /^content:\/\/backups\/dhikr-backup-.*\.json$/);
  assert.equal(folderMimeType, 'application/json');
  assert.deepEqual(Object.keys(JSON.parse(files.get(folderUri)).tables), ['dhikrs']);
  assert.deepEqual(backup.parseBackup(files.get(folderUri)).map(row => row.id).sort(), before.map(row => row.id).sort());
  const folderFiles = [...files.entries()];
  for (const code of ['ERR_PICKER_CANCELLED', 'ERR_PERMISSION_DENIED']) {
    folderPickerError = Object.assign(new Error(code), { code });
    if (code === 'ERR_PICKER_CANCELLED') assert.equal(await backup.exportBackupToDirectory(), null);
    else await assert.rejects(backup.exportBackupToDirectory(), /ERR_PERMISSION_DENIED/);
    assert.deepEqual([...files.entries()], folderFiles);
  }
  folderPickerError = null;
  folderCreateError = new Error('Provider refused file creation');
  await assert.rejects(backup.exportBackupToDirectory(), /Provider refused/);
  assert.deepEqual([...files.entries()], folderFiles);
  folderCreateError = null;
  // Keep an earlier export to ensure cleanup removes only the new partial file.
  files.set('content://backups/earlier.json', files.get(folderUri));
  files.delete(folderUri);
  folderWriteError = new Error('Provider write failed');
  await assert.rejects(backup.exportBackupToDirectory(), /Provider write failed/);
  assert.deepEqual([...files.keys()], ['content://backups/earlier.json']);
  assert.deepEqual(await db.query('SELECT * FROM dhikrs ORDER BY id'), before);
  folderWriteError = null;
  const transfer = { meta: { format: 'personal-hub.backup', version: 5 }, tables: {
    dhikrs: [{ ...before[0], id: 77, name: 'Imported', total_count: 321 }],
    notes: [{ id: 1, title: 'Must not import' }], budgets: [{ month: '2026-10' }],
  } };
  const json = JSON.stringify(transfer);
  assert.equal(backup.parseBackup(json).length, 1);
  for (const invalid of [
    { ...transfer, meta: { format: 'personal-hub.backup', version: 6 } },
    { ...transfer, tables: { dhikrs: [{ ...transfer.tables.dhikrs[0], total_count: -1 }] } },
    { ...transfer, tables: { dhikrs: [{ ...transfer.tables.dhikrs[0], last_reset_date: '2026-02-30' }] } },
    { ...transfer, tables: { dhikrs: [transfer.tables.dhikrs[0], transfer.tables.dhikrs[0]] } },
    { meta: transfer.meta, tables: {} },
  ]) {
    await assert.rejects(backup.importBackup(JSON.stringify(invalid)));
    assert.deepEqual(await db.query('SELECT * FROM dhikrs ORDER BY id'), before);
    assert.equal(backup.hasSafetyBackup(), false);
  }
  failFileWrite = true;
  await assert.rejects(backup.importBackup(json), /disk failure/);
  assert.deepEqual(await db.query('SELECT * FROM dhikrs ORDER BY id'), before);
  failFileWrite = false;
  failSql = sql => sql.startsWith('INSERT INTO dhikrs');
  await assert.rejects(backup.importBackup(json), /SQL failure/);
  assert.deepEqual(await db.query('SELECT * FROM dhikrs ORDER BY id'), before);
  assert.equal(backup.hasSafetyBackup(), true);
  failSql = null;

  await backup.importBackup(json);
  assert.equal((await dhikr.loadDhikrs())[0].id, 77);
  assert.equal((await dhikr.loadDhikrs())[0].total_count, 321);
  const safety = JSON.parse(files.get('document/dhikr-safety-backup.json'));
  assert.equal(safety.meta.format, 'dhikr.backup');
  assert.deepEqual(Object.keys(safety.tables), ['dhikrs']);
  await load('src/lib/dhikrSelection.ts').setSelectedDhikrId(77);
  await backup.restoreSafetyBackup();
  assert.deepEqual(await db.query('SELECT * FROM dhikrs ORDER BY id'), before);
  // Moving away from the counter must not snapshot counts before pending taps
  // have persisted, or apply those old taps to the newly imported records.
  const queued = dhikr.queueDhikrWrite(async () => {
    await dhikr.incrementDhikr(first.id);
  });
  await backup.importBackup(json);
  await queued;
  assert.equal((await dhikr.loadDhikrs())[0].total_count, 321);
  await backup.restoreSafetyBackup();
  assert.equal((await db.get('SELECT total_count FROM dhikrs WHERE id = ?', [first.id])).total_count, 44);
  assert.equal(stored.get('dhikr_selected_id'), String([...before].sort((a, b) => a.sort_order - b.sort_order)[0].id));
  await backup.exportBackup();
  assert.equal(exportsShared, 1);
  const exported = [...files.entries()].find(([name]) => name.startsWith('cache/dhikr-backup-'))[1];
  assert.equal(JSON.parse(exported).meta.format, 'dhikr.backup');
  assert.deepEqual(Object.keys(JSON.parse(exported).tables), ['dhikrs']);
  assert.deepEqual(backup.parseBackup(exported).map(row => row.id).sort(), before.map(row => row.id).sort());
  const beforeEmptyImport = await db.query('SELECT * FROM dhikrs ORDER BY id');
  await backup.importBackup(JSON.stringify({ meta: { format: 'dhikr.backup', version: 1 }, tables: { dhikrs: [] } }));
  assert.deepEqual(await dhikr.loadDhikrs(), []);
  await backup.restoreSafetyBackup();
  assert.deepEqual(await db.query('SELECT * FROM dhikrs ORDER BY id'), beforeEmptyImport);
  await require('./dhikr-list-regression.cjs')(root);
  await require('./dhikr-modal-regression.cjs')(root);
  await require('./updater-cache-regression.cjs')(root, { tagPrefix: 'dhikr-v', apkPrefix: 'Dhikr', packageId: 'com.dhiker.counter', dhikr: true });
  await require('./update-ui-regression.cjs')(root);
  await require('./counter-performance-regression.cjs')(root);
  await require('./feedback-performance-regression.cjs')(root);
  await require('./release-regression.cjs')(root);
  sqlite.close();
  console.log('Passed: counter limits, rollover, editing, ordering, write isolation, hub transfer, malformed backups, rollback, recovery, export, empty imports, list interactions.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
