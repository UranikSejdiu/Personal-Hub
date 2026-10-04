// Source-level regression checks with disposable in-memory SQLite fixtures.
// Run from the project root: node scripts/audit-regression.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(process.argv[2] || process.cwd());
const projectRequire = createRequire(path.join(root, 'package.json'));
const ts = projectRequire('typescript');
const source = fs.readFileSync(path.join(root, 'src/lib/db.ts'), 'utf8');
const ast = ts.createSourceFile('db.ts', source, ts.ScriptTarget.Latest, true);
const declarations = new Map();
for (const statement of ast.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const d of statement.declarationList.declarations) declarations.set(d.name.getText(ast), d.initializer);
  }
}
const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
for (const s of declarations.get('SCHEMA_STATEMENTS').elements) database.exec(s.text);
for (const obj of declarations.get('ADDITIONAL_COLUMNS').elements) {
  const fields = Object.fromEntries(obj.properties.map(p => [p.name.getText(ast), p.initializer.text]));
  if (!database.prepare(`PRAGMA table_info(${fields.table})`).all().some(c => c.name === fields.column)) {
    database.exec(`ALTER TABLE ${fields.table} ADD COLUMN ${fields.column} ${fields.definition}`);
  }
}
let failOn = null;
let notesFtsEnabled = false;
const executor = {
  async query(sql, values = []) { return database.prepare(sql).all(...values); },
  async get(sql, values = []) { return database.prepare(sql).get(...values); },
  async execute(sql, values = []) {
    if (failOn && failOn(sql, values)) throw new Error('Injected write failure');
    const result = database.prepare(sql).run(...values);
    return { changes: result.changes, lastId: Number(result.lastInsertRowid) };
  },
};
const dbMock = {
  ...executor, defaultExecutor: executor, isNotesFtsEnabled: () => notesFtsEnabled,
  async withTransaction(fn) {
    database.exec('BEGIN');
    try { const result = await fn({ ...executor }); database.exec('COMMIT'); return result; }
    catch (e) { database.exec('ROLLBACK'); throw e; }
  },
};
const stored = new Map();
const files = new Map();
const scheduledReminders = new Map();
let reminderPermission = { granted: true, canAskAgain: true };
let reminderNativeAvailable = true;
let reminderScheduleFailure = false;
let reminderPermissionRequests = 0;
let reminderSchedules = 0;
class FakeFile {
  constructor(...parts) { this.uri = parts.map(part => typeof part === 'string' ? part : part.uri).join('/'); }
  get name() { return this.uri.split('/').at(-1); }
  get exists() { return files.has(this.uri); }
  get size() { return Buffer.byteLength(files.get(this.uri) || ''); }
  write(value) { files.set(this.uri, value); }
  async text() { return files.get(this.uri); }
  delete() { files.delete(this.uri); }
  move(target) { files.set(target.uri, files.get(this.uri)); files.delete(this.uri); }
}
class FakeDirectory {
  constructor(uri) { this.uri = uri; }
  list() { return [...files.keys()].filter(uri => uri.startsWith(`${this.uri}/`)).map(uri => new FakeFile(uri)); }
}
const mocks = {
  'expo': { isRunningInExpoGo: () => false, requireOptionalNativeModule: () => reminderNativeAvailable ? {} : null },
  'expo-notifications': {
    setNotificationHandler() {},
    AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    async setNotificationChannelAsync() {},
    async getPermissionsAsync() { return reminderPermission; },
    async requestPermissionsAsync() { reminderPermissionRequests++; return reminderPermission; },
    async getAllScheduledNotificationsAsync() { return [...scheduledReminders.values()]; },
    async cancelScheduledNotificationAsync(id) { scheduledReminders.delete(id); },
    async scheduleNotificationAsync(request) {
      if (reminderScheduleFailure) throw new Error('Injected notification failure');
      reminderSchedules++; scheduledReminders.set(request.identifier, request); return request.identifier;
    },
  },
  'expo-secure-store': {
    async getItemAsync(key) { return stored.get(key) || null; },
    async setItemAsync(key, value) { stored.set(key, value); },
    async deleteItemAsync(key) { stored.delete(key); },
  },
  'expo-application': { nativeApplicationVersion: '1.19.6' },
  'react-native': { Platform: { OS: 'android' } },
  'expo-file-system': { File: FakeFile, Paths: { document: new FakeDirectory('document'), cache: new FakeDirectory('cache') } },
  'expo-sharing': {},
};
const modules = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (filename === path.join(root, 'src/lib/db.ts')) return dbMock;
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
const budget = load(path.join(root, 'src/lib/budget.ts'));
const repayments = load(path.join(root, 'src/lib/repaymentPlans.ts'));
const notes = load(path.join(root, 'src/lib/notes.ts'));
const savings = load(path.join(root, 'src/lib/savings.ts'));
const dhikr = load(path.join(root, 'src/lib/dhikr.ts'));
const tasks = load(path.join(root, 'src/lib/tasks.ts'));
const taskDates = load(path.join(root, 'src/lib/taskDates.ts'));
const taskReminders = load(path.join(root, 'src/lib/taskReminders.ts'));
const backup = load(path.join(root, 'src/lib/backup.ts'));
const sample = load(path.join(root, 'src/lib/sampleData.ts'));
const calculations = load(path.join(root, 'src/lib/calculations.ts'));
const reset = () => {
  failOn = null;
  notesFtsEnabled = false;
  for (const name of ['tasks', 'task_lists', 'repayment_payments', 'repayment_plans', 'expenses', 'budgets', 'recurring_expenses', 'savings_auto_deposits', 'savings_transactions', 'dhikrs', 'note_items', 'notes', 'loans', 'savings_goals']) database.exec(`DELETE FROM ${name}`);
  stored.clear(); files.clear();
  scheduledReminders.clear(); reminderPermission = { granted: true, canAskAgain: true };
  reminderNativeAvailable = true; reminderScheduleFailure = false; reminderPermissionRequests = 0; reminderSchedules = 0;
};
const results = [];
async function verify(name, fn) { reset(); await fn(); results.push({ name, passed: true }); }
function migrationModule(fixture) {
  const filename = path.join(root, 'src/lib/db.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const native = {
    async execAsync(sql) { fixture.exec(sql); },
    async getFirstAsync(sql, values = []) { return fixture.prepare(sql).get(...values); },
    async getAllAsync(sql, values = []) { return fixture.prepare(sql).all(...values); },
    async runAsync(sql, values = []) { return fixture.prepare(sql).run(...values); },
    async withTransactionAsync(fn) {
      fixture.exec('BEGIN');
      try { const result = await fn(); fixture.exec('COMMIT'); return result; }
      catch (error) { fixture.exec('ROLLBACK'); throw error; }
    },
  };
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'expo-sqlite') return { openDatabaseAsync: async () => native };
    if (name === './noteContent') return { contentToMarkdown: () => '' };
    if (name === './lexicalPreview') return { isLexicalJson: () => false };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}
(async () => {
  await verify('Independent plans allow arbitrary loan/card counts, isolated paid state, and backup restore', async () => {
    const created = [];
    for (let i = 0; i < 3; i++) created.push(await repayments.saveRepaymentPlan({ kind: 'loan', name: `Loan ${i}`, amount: 1200, apr: 0, payment: 100, term: 12, monthsPaid: 0, startMonth: '2026-10' }));
    for (let i = 0; i < 10; i++) created.push(await repayments.saveRepaymentPlan({ kind: 'card', name: `Card ${i}`, amount: 100, apr: 0, payment: 0, term: 4, monthsPaid: 0, startMonth: '2026-10' }));
    assert.equal((await repayments.listRepaymentPlans()).length, 13);
    await budget.saveBudget('2026-10', 2000, false, false);
    await repayments.setRepaymentPaid(created[3].id, '2026-10', true);
    assert.deepEqual([...await repayments.paidRepaymentIds('2026-10')], [created[3].id]);
    const summary = budget.computeMonthSummary({ month: '2026-10', income: 2000, loanPaid: false, ccPaid: false, totalExpenses: 0, paidExpenses: 0 }, budget.EMPTY_LOANS, 0, await repayments.listRepaymentPlans(), await repayments.paidRepaymentIds('2026-10'));
    assert.equal(summary.outflow, 550);
    assert.equal(summary.actualOutflow, 25);
    const env = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    assert.equal((await repayments.listRepaymentPlans()).length, 13);
    assert.deepEqual([...await repayments.paidRepaymentIds('2026-10')], [created[3].id]);
    await budget.deleteBudget('2026-10');
    assert.equal((await repayments.paidRepaymentIds('2026-10')).size, 0);
    assert.equal((await repayments.listRepaymentPlans()).find(p => p.id === created[3].id).monthsPaid, 0);
  });
  await verify('Version 2 backups require payment tables while version 1 backups remain importable', async () => {
    const env = await backup.buildBackupEnvelope();
    delete env.tables.repaymentPlans;
    delete env.tables.repaymentPayments;
    assert.equal(backup.validateEnvelope(env).ok, false);
    env.meta.version = 1;
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    assert.equal((await repayments.listRepaymentPlans()).length, 0);
  });
  await verify('A saved payment plan prevents demo data from being seeded over user data', async () => {
    await repayments.saveRepaymentPlan({ kind: 'loan', name: 'My loan', amount: 0, apr: 0, payment: 100, term: 12, monthsPaid: 0, startMonth: '2026-10' });
    assert.equal(await sample.isDatabaseEmpty(), false);
  });
  await verify('Checklist editor blocks save/navigation until drop completes and prevents duplicate saves', async () => {
    await require('./checklist-editor-regression.cjs')(root);
  });
  await verify('Text/checklist editors save drafts when archiving, block overlapping operations, and recover from failures', async () => {
    await require('./notes-editor-regression.cjs')(root);
  });
  await verify('Dhikr Arrange previews, cancellation, saves, and failure retry', async () => {
    await require('./dhikr-list-regression.cjs')(root);
  });
  await verify('Editing a dhikr total persists and rejects invalid counts without changing the record', async () => {
    const created = await dhikr.addDhikr('Test', 100);
    await dhikr.updateDhikr(created.id, { total_count: 0 });
    assert.equal((await dhikr.loadDhikrs())[0].total_count, 0);
    await dhikr.updateDhikr(created.id, { name: 'Updated', total_count: 42 });
    assert.equal(await dhikr.incrementDhikr(created.id), true);
    const updated = (await dhikr.loadDhikrs())[0];
    assert.equal(updated.name, 'Updated');
    assert.equal(updated.total_count, 43);
    assert.equal(updated.daily_count, 1);
    await assert.rejects(dhikr.updateDhikr(created.id, { total_count: -1 }), RangeError);
    await assert.rejects(dhikr.updateDhikr(created.id, { total_count: Number.MAX_SAFE_INTEGER + 1 }), RangeError);
    assert.equal((await dhikr.loadDhikrs())[0].total_count, 43);
  });
  await verify('Loan editor prevents duplicate saves and changes during pending operations', async () => {
    await require('./loan-editor-regression.cjs')(root);
  });
  await verify('Recurring edits update templates without rewriting past month expenses', async () => {
    const b = await budget.saveBudget('2026-09', 2500, false, false);
    const e = await budget.addExpense(b.id, 'Rent', 100, false);
    await budget.setExpenseRecurring(e.id, 'Rent', 100, true);
    await budget.updateExpense(e.id, { category: 'Housing', amount: 200 });
    assert.deepEqual((await budget.listRecurringExpenses()).map(r => [r.category, r.amount]), [['Housing', 200]]);
    const next = await budget.createBudgetMonth('2026-10');
    assert.equal((await budget.listExpenses(next.budget.id))[0].amount, 200);
    await budget.updateExpense(e.id, { amount: 300 });
    assert.equal((await budget.listExpenses(next.budget.id))[0].amount, 200);
    await budget.setExpenseRecurring(e.id, 'stale UI name', 100, false);
    assert.equal((await budget.listRecurringExpenses()).length, 0);
  });
  await verify('Recurring mutations roll back template changes when the expense write fails', async () => {
    const b = await budget.saveBudget('2026-10', 2500, false, false);
    const e = await budget.addExpense(b.id, 'Rent', 100, false);
    await budget.setExpenseRecurring(e.id, 'Rent', 100, true);
    failOn = sql => sql.startsWith('UPDATE expenses SET amount');
    await assert.rejects(budget.updateExpense(e.id, { amount: 200 }));
    failOn = null;
    assert.equal((await budget.listRecurringExpenses())[0].amount, 100);
    assert.equal((await budget.listExpenses(b.id))[0].amount, 100);
    await budget.removeExpense(e.id);
    assert.equal((await budget.listRecurringExpenses()).length, 0);
  });
  await verify('Settings target sync updates the current auto deposit and preserves past snapshots', async () => {
    const month = budget.currentMonth();
    const past = budget.addMonths(month, -1);
    await executor.execute('INSERT INTO savings_auto_deposits (month, amount, description) VALUES (?, ?, ?)', [past, 80, 'Past']);
    await budget.saveBudgetPreferences(100, 2500);
    await budget.saveBudgetPreferences(200, 2500);
    const rows = await savings.listAutoDeposits();
    assert.equal(rows.find(r => r.month === month).amount, 200);
    assert.equal(rows.find(r => r.month === past).amount, 80);
    failOn = sql => sql.startsWith('INSERT INTO savings_auto_deposits');
    await assert.rejects(budget.saveBudgetPreferences(300, 2500));
    failOn = null;
    assert.equal((await budget.loadSavingsGoal()).goal_amount, 200);
    await budget.saveBudgetPreferences(0, 2500);
    assert.equal((await savings.listAutoDeposits()).find(r => r.month === month).amount, 0);
  });
  await verify('Notes pages are bounded and checklist previews retain accurate totals', async () => {
    for (let i = 0; i < 45; i++) await notes.createNote({ title: `Note ${String(i).padStart(2, '0')}`, content: 'searchable', is_pinned: i === 44 });
    const first = await notes.loadNotesPage('', 'title');
    assert.equal(first.notes.length, 40);
    assert.equal(first.hasMore, true);
    assert.equal(first.notes[0].is_pinned, true);
    const second = await notes.loadNotesPage('', 'title', first.nextOffset);
    assert.equal(second.notes.length, 5);
    assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.notes, ...second.notes].map(n => n.id)).size, 45);
    const search = await notes.loadNotesPage('Note 0', 'title', 0, 3);
    assert.equal(search.notes.length, 3);
    assert.equal(search.hasMore, true);
    await assert.rejects(notes.loadNotesPage('', 'title', -1));
    const checklist = await notes.createChecklistNote({ title: 'Preview checklist', is_pinned: true, color: 'default' }, Array.from({length: 100}, (_, i) => ({ text: `Item ${i}`, checked: i < 20 })));
    const preview = (await notes.loadNotesPage('Preview checklist', 'updated')).notes[0];
    assert.equal(preview.items.length, 6);
    assert.deepEqual(preview.checklistPreview, { total: 100, checked: 20, active: 80 });
    assert.equal((await notes.getChecklistItems(checklist.id)).length, 100);
  });
  await verify('Recurring population skips an existing matching expense', async () => {
    const b = await budget.saveBudget('2026-09', 1000, false, false);
    await executor.execute('INSERT INTO recurring_expenses(category, amount) VALUES (?, ?)', ['Rent', 100]);
    await budget.addExpense(b.id, 'Rent', 100, true);
    await budget.populateRecurringExpenses(b.id);
    assert.equal((await budget.listExpenses(b.id)).length, 1);
  });
  await verify('Creating a requested month uses salary and includes recurring expenses', async () => {
    await executor.execute('INSERT INTO savings_goals(id, salary) VALUES (1, ?)', [2500]);
    await executor.execute('INSERT INTO recurring_expenses(category, amount) VALUES (?, ?)', ['Rent', 950]);
    const result = await budget.createBudgetMonth('2026-10');
    assert.equal(result.created, true);
    assert.equal(result.budget.month, '2026-10');
    assert.equal(result.budget.income, 2500);
    assert.equal(await budget.loadBudget('2026-11'), null);
    assert.deepEqual((await budget.listExpenses(result.budget.id)).map(e => [e.category, e.amount, e.paid]), [['Rent', 950, false]]);
  });
  await verify('Creating a month uses Settings income and keeps an existing month intact', async () => {
    await budget.saveBudget('2026-09', 1800, false, false);
    await budget.saveSavingsGoal(0, 2500);
    const first = await budget.createBudgetMonth('2026-10');
    assert.equal(first.budget.income, 2500);
    await budget.saveBudget('2026-10', 2200, true, true);
    await budget.addExpense(first.budget.id, 'Custom', 70);
    const second = await budget.createBudgetMonth('2026-10');
    assert.equal(second.created, false);
    assert.equal(second.budget.income, 2200);
    assert.equal(second.budget.loan_paid, true);
    assert.equal(second.budget.cc_paid, true);
    assert.equal((await budget.listExpenses(second.budget.id)).length, 1);
  });
  await verify('Settings income updates current and future months while preserving history and payments', async () => {
    const month = budget.currentMonth();
    const past = budget.addMonths(month, -1);
    const future = budget.addMonths(month, 1);
    await budget.saveSavingsGoal(100, 1800);
    await budget.saveBudget(past, 1700, true, true);
    await budget.saveBudget(month, 1800, true, false);
    await budget.saveBudget(future, 1800, false, true);
    await budget.saveBudgetPreferences(200, 2500);
    assert.equal((await budget.loadBudget(past)).income, 1700);
    assert.equal((await budget.loadBudget(month)).income, 2500);
    assert.equal((await budget.loadBudget(month)).loan_paid, true);
    assert.equal((await budget.loadBudget(future)).income, 2500);
    assert.equal((await budget.loadBudget(future)).cc_paid, true);
    assert.equal((await budget.loadSavingsGoal()).goal_amount, 200);
    await budget.saveBudgetPreferences(200, 0);
    await budget.copyBudgetFromMonth(past, month);
    assert.equal((await budget.loadBudget(month)).income, 0, 'Copying expenses must preserve zero income');
    assert.equal((await budget.createBudgetMonth(budget.addMonths(month, 2))).budget.income, 0);
  });
  await verify('A failed Settings income update rolls back the profile and budgets', async () => {
    const month = budget.currentMonth();
    await budget.saveSavingsGoal(100, 1800);
    await budget.saveBudget(month, 1800, false, false);
    failOn = sql => sql.startsWith('UPDATE budgets SET income');
    await assert.rejects(budget.saveBudgetPreferences(200, 2500));
    failOn = null;
    assert.equal((await budget.loadSavingsGoal()).salary, 1800);
    assert.equal((await budget.loadSavingsGoal()).goal_amount, 100);
    assert.equal((await budget.loadBudget(month)).income, 1800);
    for (const value of [-1, NaN, Infinity]) await assert.rejects(budget.saveBudgetPreferences(100, value));
  });
  await verify('A failed recurring write rolls back the entire new month', async () => {
    await executor.execute('INSERT INTO recurring_expenses(category, amount) VALUES (?, ?)', ['Rent', 950]);
    failOn = sql => sql.startsWith('INSERT INTO expenses');
    await assert.rejects(budget.createBudgetMonth('2026-10'));
    assert.equal(await budget.loadBudget('2026-10'), null);
    assert.equal((await executor.query('SELECT * FROM expenses')).length, 0);
  });
  await verify('Creating a month rejects malformed keys without writing', async () => {
    for (const month of ['2026-00', '2026-13', '2026-1', 'invalid', '0000-01']) {
      await assert.rejects(budget.createBudgetMonth(month));
    }
    assert.equal((await executor.query('SELECT * FROM budgets')).length, 0);
  });
  await verify('Transactional budget delete removes child expenses', async () => {
    const b = await budget.saveBudget('2026-09', 1000, false, false);
    await budget.addExpense(b.id, 'Rent', 100);
    await dbMock.withTransaction(tx => budget.deleteBudget('2026-09', tx));
    assert.equal((await executor.query('PRAGMA foreign_key_check')).length, 0);
    const envelope = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(envelope).ok, true);
  });
  await verify('Failed checklist creation rolls back note and items', async () => {
    failOn = (sql, values) => sql.startsWith('INSERT INTO note_items') && values[1] === 'second';
    await assert.rejects(notes.createChecklistNote({ title: 'Shopping', is_pinned: false }, [
      { text: 'first', checked: false }, { text: 'second', checked: false },
    ]));
    assert.equal((await executor.query('SELECT * FROM notes')).length, 0);
    assert.equal((await executor.query('SELECT * FROM note_items')).length, 0);
  });
  await verify('Standalone note deletion rolls back items on failure and removes both on success', async () => {
    const note = await notes.createChecklistNote({ title: 'Keep me', is_pinned: true }, [
      { text: 'first', checked: false }, { text: 'done', checked: true },
    ]);
    const original = await notes.getChecklistItems(note.id);
    failOn = sql => sql.startsWith('DELETE FROM notes WHERE');
    await assert.rejects(notes.deleteNote(note.id));
    assert.deepEqual(await notes.getChecklistItems(note.id), original);
    assert.equal((await notes.getNote(note.id)).title, 'Keep me');
    failOn = null;
    await notes.deleteNote(note.id);
    assert.equal(await notes.getNote(note.id), undefined);
    assert.deepEqual(await notes.getChecklistItems(note.id), []);
  });
  await verify('Standalone checklist save rolls back every write and rejects missing or text notes', async () => {
    const note = await notes.createChecklistNote({ title: 'Keep me', is_pinned: false }, [{ text: 'original', checked: true }]);
    const original = await notes.getChecklistItems(note.id);
    failOn = sql => sql.startsWith('INSERT INTO note_items');
    await assert.rejects(notes.saveChecklistNote(note.id, { title: 'Changed', is_pinned: true }, [{ text: 'changed', checked: false }]));
    failOn = null;
    assert.deepEqual(await notes.getChecklistItems(note.id), original);
    assert.equal((await notes.getNote(note.id)).title, 'Keep me');
    await assert.rejects(notes.saveChecklistNote(999999, { title: 'Missing', is_pinned: false }, [{ text: 'orphan', checked: false }]));
    const text = await notes.createNote({ title: 'Text', content: 'body', is_pinned: false });
    await assert.rejects(notes.saveChecklistNote(text.id, { title: 'Wrong editor', is_pinned: false }, []));
    assert.equal((await notes.getNote(text.id)).content, 'body');
    assert.deepEqual(await notes.getChecklistItems(text.id), []);
    await assert.rejects(notes.updateNote(999999, { title: 'Missing' }));
  });
  await verify('Failed backup restore leaves original notes and checklist items intact', async () => {
    const original = await notes.createChecklistNote({ title: 'Original', is_pinned: false }, [{ text: 'Safe item', checked: false }]);
    const items = await notes.getChecklistItems(original.id);
    const env = await backup.buildBackupEnvelope();
    env.tables.notes[0].title = 'Imported';
    failOn = sql => sql.startsWith('INSERT INTO note_items');
    await assert.rejects(backup.importBackupFromJson(JSON.stringify(env)), /Restore failed/);
    failOn = null;
    assert.equal((await notes.getNote(original.id)).title, 'Original');
    assert.deepEqual(await notes.getChecklistItems(original.id), items);
  });
  await verify('Archives freeze text/checklist contents and restore without changing frozen records', async () => {
    const text = await notes.createNote({ title: 'Shared text', content: 'needle', is_pinned: true });
    const list = await notes.createChecklistNote({ title: 'Shared list', is_pinned: false }, [{ text: 'needle', checked: true }]);
    await notes.updateNote(text.id, { title: 'Archived text', content: 'edited needle', is_archived: true });
    await notes.saveChecklistNote(list.id, { title: 'Archived list', is_pinned: true, is_archived: true }, [{ text: 'edited needle', checked: false }]);
    assert.deepEqual(await notes.loadNotes(), []);
    assert.deepEqual(await notes.searchNotes('needle'), []);
    assert.deepEqual((await notes.searchNotes('needle', 'title', undefined, true)).map(n => n.id), [list.id, text.id]);
    assert.equal((await notes.getNote(text.id)).content, 'edited needle');
    assert.equal((await notes.getNote(text.id)).is_pinned, true);
    const frozenText = await notes.getNote(text.id);
    for (const fields of [{ title: 'Changed' }, { content: 'Changed' }, { is_pinned: false }, { title: 'Bypass', is_archived: false }]) {
      await assert.rejects(notes.updateNote(text.id, fields), /archived/);
      assert.deepEqual(await notes.getNote(text.id), frozenText);
    }
    const originalItems = await notes.getChecklistItems(list.id);
    failOn = sql => sql.startsWith('INSERT INTO note_items');
    await assert.rejects(notes.saveChecklistNote(list.id, { title: 'Bad move', is_pinned: false, is_archived: false }, [{ text: 'failed', checked: true }]));
    failOn = null;
    assert.equal((await notes.getNote(list.id)).is_archived, true);
    assert.equal((await notes.getNote(list.id)).title, 'Archived list');
    assert.deepEqual(await notes.getChecklistItems(list.id), originalItems);
    await notes.restoreNote(text.id);
    await notes.restoreNote(list.id);
    assert.equal((await notes.getNote(text.id)).content, frozenText.content);
    assert.equal((await notes.getNote(text.id)).title, frozenText.title);
    assert.equal((await notes.getNote(list.id)).title, 'Archived list');
    assert.deepEqual(await notes.getChecklistItems(list.id), originalItems, 'Restore preserves item IDs and positions');
    await notes.updateNote(text.id, { title: 'Editable again' });
    await notes.saveChecklistNote(list.id, { title: 'Restored list', is_pinned: true }, originalItems);
    await assert.rejects(notes.restoreNote(999999));
    assert.equal((await notes.loadNotes()).length, 2);
    assert.deepEqual(await notes.loadNotes('updated', undefined, true), []);
    assert.equal((await notes.getChecklistItems(list.id))[0].text, 'edited needle');
  });
  await verify('Archive pages filter before pagination for every sort and escaped LIKE search', async () => {
    for (let i = 0; i < 95; i++) {
      const note = await notes.createNote({ title: `Item ${String(i).padStart(3, '0')}`, content: 'needle 100%_safe', is_pinned: i === 90 });
      if (i % 2 === 0) await notes.updateNote(note.id, { is_archived: true });
    }
    for (const archived of [false, true]) {
      for (const sort of ['updated', 'created', 'title']) {
        for (const query of ['', 'needle', '%_']) {
          const first = await notes.loadNotesPage(query, sort, 0, 40, archived);
          const second = await notes.loadNotesPage(query, sort, first.nextOffset, 40, archived);
          const all = [...first.notes, ...second.notes];
          assert.equal(first.hasMore, true);
          assert.equal(second.hasMore, false);
          assert.equal(all.length, archived ? 48 : 47);
          assert.equal(new Set(all.map(n => n.id)).size, all.length);
          assert.ok(all.every(n => n.is_archived === archived));
          if (archived) assert.equal(first.notes[0].is_pinned, true);
        }
      }
    }
    await assert.rejects(notes.loadNotesPage('', 'updated', -1));
    await assert.rejects(notes.loadNotesPage('', 'updated', 0, 101));
  });
  await verify('Archive backups round trip and legacy backups default to active notes; invalid flags are rejected', async () => {
    const text = await notes.createNote({ title: 'Archive', content: 'body', is_pinned: false });
    const list = await notes.createChecklistNote({ title: 'List', is_pinned: true }, [{ text: 'kept', checked: true }]);
    await notes.updateNote(text.id, { is_archived: true });
    await notes.updateNote(list.id, { is_archived: true });
    const env = await backup.buildBackupEnvelope();
    assert.equal(env.meta.version, 5);
    await backup.importBackupFromJson(JSON.stringify(env));
    assert.deepEqual(await notes.loadNotes(), []);
    const restored = await notes.loadNotes('updated', undefined, true);
    assert.equal(restored.length, 2);
    assert.equal(restored.find(n => n.kind === 'checklist').items[0].text, 'kept');
    for (const version of [1, 2, 3]) {
      const legacy = JSON.parse(JSON.stringify(env));
      legacy.meta.version = version;
      legacy.tables.notes.forEach(n => delete n.is_archived);
      await backup.importBackupFromJson(JSON.stringify(legacy));
      assert.equal((await notes.loadNotes()).length, 2);
      assert.deepEqual(await notes.loadNotes('updated', undefined, true), []);
    }
    for (const flag of [2, -1, '1', true, null]) {
      const invalid = JSON.parse(JSON.stringify(env));
      invalid.tables.notes[0].is_archived = flag;
      assert.equal(backup.validateEnvelope(invalid).ok, false);
      await assert.rejects(backup.importBackupFromJson(JSON.stringify(invalid)));
      assert.equal((await notes.loadNotes()).length, 2);
    }
    const incomplete = JSON.parse(JSON.stringify(env));
    delete incomplete.tables.notes[0].is_archived;
    assert.equal(backup.validateEnvelope(incomplete).ok, false);
    incomplete.tables.notes[0].is_archived = 1;
    delete incomplete.tables.noteItems;
    assert.equal(backup.validateEnvelope(incomplete).ok, false);
  });
  await verify('Demo cleanup preserves archived sample notes and their checklist items', async () => {
    await sample.seedSampleData();
    const all = await notes.loadNotes();
    for (const note of all) await notes.updateNote(note.id, { is_archived: true });
    await sample.clearSampleData();
    const kept = await notes.loadNotes('updated', undefined, true);
    assert.equal(kept.length, all.length);
    assert.deepEqual(kept.find(n => n.kind === 'checklist').items, all.find(n => n.kind === 'checklist').items);
  });
  await verify('Checklist reorder persists and a failed save preserves the prior order', async () => {
    const note = await notes.createChecklistNote({ title: 'Shopping', is_pinned: false }, [
      { text: 'first', checked: false }, { text: 'second', checked: false },
      { text: 'done', checked: true },
    ]);
    const reordered = [
      { text: 'second', checked: false }, { text: 'first', checked: false },
      { text: 'done', checked: true },
    ];
    await dbMock.withTransaction(tx => notes.saveChecklistNote(
      note.id, { title: 'Reordered', is_pinned: false }, reordered, tx
    ));
    assert.deepEqual((await notes.getChecklistItems(note.id)).map(({ text, checked }) => ({ text, checked })), reordered);
    failOn = (sql, values) => sql.startsWith('INSERT INTO note_items') && values[1] === 'failure';
    await assert.rejects(dbMock.withTransaction(tx => notes.saveChecklistNote(
      note.id, { title: 'Failed edit', is_pinned: false }, [
        { text: 'changed', checked: false }, { text: 'failure', checked: false },
      ], tx
    )));
    assert.deepEqual((await notes.getChecklistItems(note.id)).map(({ text, checked }) => ({ text, checked })), reordered);
    assert.equal((await executor.get('SELECT title FROM notes WHERE id = ?', [note.id])).title, 'Reordered');
  });
  await verify('Loan payment toggles are reversible and idempotent at the term', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, loan_amount: 1200, loan_term: 12, loan_months_paid: 11 });
    await budget.saveBudget('2026-09', 1000, false, false);
    await budget.applyLoanPaidToggle('2026-09', true);
    await budget.applyLoanPaidToggle('2026-09', true);
    assert.equal((await budget.loadLoans()).loan_months_paid, 12);
    await budget.applyLoanPaidToggle('2026-09', false);
    assert.equal((await budget.loadLoans()).loan_months_paid, 11);
    await budget.saveLoans({ ...(await budget.loadLoans()), loan_months_paid: 12 });
    await budget.applyLoanPaidToggle('2026-09', true);
    await budget.applyLoanPaidToggle('2026-09', false);
    assert.equal((await budget.loadLoans()).loan_months_paid, 12);
  });
  await verify('Payment-only loan plans affect only their scheduled months', async () => {
    const loans = { ...budget.EMPTY_LOANS, loan_payment: 225, loan_term: 12, loan_months_paid: 3, loan_schedule_mode: 'count', loan_start_month: '2026-11', loan_end_month: '2027-07' };
    await budget.saveLoans(loans);
    assert.equal(budget.loanMonthlyPayment(loans), 225);
    for (const [month, expected] of [['2026-10', 0], ['2026-11', 225], ['2027-07', 225], ['2027-08', 0]]) {
      await budget.saveBudget(month, 1000, false, false);
      assert.equal(budget.loanPaymentForMonth(await budget.loadLoans(), month), expected);
      const summary = budget.computeMonthSummary({ month, income: 1000, loanPaid: false, ccPaid: false, totalExpenses: 0, paidExpenses: 0 }, loans, 0);
      assert.equal(summary.outflow, expected);
      if (expected === 0) await assert.rejects(budget.applyLoanPaidToggle(month, true));
    }
    await budget.applyLoanPaidToggle('2026-11', true);
    assert.equal((await budget.loadLoans()).loan_months_paid, 4);
    await budget.applyLoanPaidToggle('2026-11', false);
    assert.equal((await budget.loadLoans()).loan_months_paid, 3);
  });
  await verify('Legacy loan calculations remain unbounded after migration', async () => {
    const loans = { ...budget.EMPTY_LOANS, loan_amount: 1200, loan_term: 12, loan_months_paid: 4 };
    await budget.saveLoans(loans);
    const restored = await budget.loadLoans();
    assert.equal(restored.loan_schedule_mode, null);
    assert.equal(budget.loanPaymentForMonth(restored, '2025-01'), budget.loanMonthlyPayment(restored));
    assert.equal(budget.loanPaymentForMonth(restored, '2028-12'), budget.loanMonthlyPayment(restored));
  });
  await verify('Credit-card payment toggles are idempotent', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, cc_balance: 1200, cc_payment: 150 });
    await budget.saveBudget('2026-09', 1000, false, false);
    await budget.applyCcPaidToggle('2026-09', true);
    await budget.applyCcPaidToggle('2026-09', true);
    assert.equal((await budget.loadLoans()).cc_months_paid, 1);
    await budget.applyCcPaidToggle('2026-09', false);
    assert.equal((await budget.loadLoans()).cc_months_paid, 0);
  });
  await verify('An empty second card is ignored and cannot be marked paid', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, cc_payment: 150 });
    await budget.saveBudget('2026-11', 1000, false, false);
    const [summary] = await budget.listMonthSummaries(await budget.loadLoans());
    assert.equal(summary.outflow, 150);
    assert.equal(summary.actualOutflow, 0);
    await assert.rejects(budget.applyCcPaidToggle('2026-11', true, 2));
    assert.equal((await budget.loadBudget('2026-11')).cc2_paid, false);
    assert.equal((await budget.loadLoans()).cc2_months_paid, 0);
  });
  await verify('Two credit cards have independent, reversible payment flags and counters', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, cc_payment: 150, cc2_payment: 100 });
    await budget.saveBudget('2026-11', 1000, false, false);
    await budget.applyCcPaidToggle('2026-11', true, 2);
    await budget.applyCcPaidToggle('2026-11', true, 2);
    assert.equal((await budget.loadLoans()).cc2_months_paid, 1);
    assert.equal((await budget.loadLoans()).cc_months_paid, 0);
    assert.equal((await budget.loadBudget('2026-11')).cc_paid, false);
    await budget.applyCcPaidToggle('2026-11', true, 1);
    await budget.applyCcPaidToggle('2026-11', false, 2);
    const loans = await budget.loadLoans();
    assert.equal(loans.cc_months_paid, 1);
    assert.equal(loans.cc2_months_paid, 0);
    const row = await budget.loadBudget('2026-11');
    assert.equal(row.cc_paid, true);
    assert.equal(row.cc2_paid, false);
  });
  await verify('Credit card schedules include both endpoints and support open boundaries', async () => {
    const cards = load(path.join(root, 'src/lib/creditCards.ts'));
    const loans = { ...budget.EMPTY_LOANS, cc_payment: 150, cc2_payment: 100, cc2_start_month: '2026-11', cc2_end_month: '2027-11' };
    await budget.saveLoans(loans);
    for (const [month, payment] of [['2026-10', 0], ['2026-11', 100], ['2027-11', 100], ['2027-12', 0]]) {
      await budget.saveBudget(month, 1000, false, false);
      const card = cards.creditCardDetails(loans, 2);
      assert.equal(cards.creditCardPaymentForMonth(card, month), payment);
      const summary = budget.computeMonthSummary({ month, income: 1000, loanPaid: false, ccPaid: true, cc2Paid: true, totalExpenses: 0, paidExpenses: 0 }, loans, 0);
      assert.equal(summary.outflow, 150 + payment);
      assert.equal(summary.actualOutflow, 150 + payment);
      if (payment === 0) await assert.rejects(budget.applyCcPaidToggle(month, true, 2));
    }
    const card = cards.creditCardDetails(loans, 2);
    assert.equal(cards.creditCardScheduledMonths(card), 13);
    assert.equal(cards.creditCardScheduledMonths({ ...card, endMonth: '2027-10' }), 12);
    assert.equal(cards.creditCardScheduledMonths({ ...card, endMonth: '2026-12' }), 2);
    assert.equal(cards.creditCardScheduledMonths({ ...card, endMonth: '2026-11' }), 1);
    assert.equal(cards.creditCardScheduledMonths({ ...card, endMonth: '2026-10' }), null);
    assert.equal(cards.creditCardScheduledMonths({ ...card, endMonth: 'invalid' }), null);
    assert.equal(cards.creditCardScheduledMonths({ ...card, startMonth: null }), null);
    assert.equal(cards.creditCardScheduledMonths({ ...card, endMonth: null }), null);
    assert.equal(cards.creditCardPaymentForMonth({ ...card, startMonth: null }, '2026-10'), 100);
    assert.equal(cards.creditCardPaymentForMonth({ ...card, endMonth: null }, '2027-12'), 100);
    assert.equal(cards.creditCardPaymentForMonth({ ...card, startMonth: null, endMonth: null }, '2026-01'), 100);
    const summaries = await budget.listMonthSummaries(loans);
    assert.equal(summaries.find(s => s.month === '2026-10').outflow, 150);
    assert.equal(summaries.find(s => s.month === '2026-11').outflow, 250);
  });
  await verify('Installments split a repayable total into exact months and cents', async () => {
    const cards = load(path.join(root, 'src/lib/creditCards.ts'));
    const plan = { ...budget.EMPTY_LOANS, cc_plan_mode: 'installment', cc_balance: 550, cc_payment: 45.83, cc_installments: 12, cc_start_month: '2026-06', cc_end_month: '2027-05', cc_months_paid: 4 };
    assert.equal(cards.installmentEndMonth('2026-06', 12), '2027-05');
    assert.equal(cards.installmentEndMonth('2026-11', 12), '2027-10');
    assert.deepEqual(cards.installmentPayments({ balance: 999, installments: 12 }), { regular: 83.25, final: 83.25, total: 999 });
    assert.deepEqual(cards.installmentPayments({ balance: 550, installments: 12 }), { regular: 45.83, final: 45.87, total: 550 });
    await budget.saveLoans(plan);
    const restored = await budget.loadLoans();
    assert.equal(restored.cc_plan_mode, 'installment');
    assert.equal(restored.cc_installments, 12);
    assert.equal(cards.creditCardPaymentForMonth(cards.creditCardDetails(restored, 1), '2026-05'), 0);
    assert.equal(cards.creditCardPaymentForMonth(cards.creditCardDetails(restored, 1), '2026-06'), 45.83);
    assert.equal(cards.creditCardPaymentForMonth(cards.creditCardDetails(restored, 1), '2027-05'), 45.87);
    assert.equal(cards.creditCardPaymentForMonth(cards.creditCardDetails(restored, 1), '2027-06'), 0);
    assert.equal(Math.round((11 * 45.83 + 45.87) * 100), 55000);
    const last = budget.computeMonthSummary({ month: '2027-05', income: 1000, loanPaid: false, ccPaid: true, cc2Paid: false, totalExpenses: 0, paidExpenses: 0 }, restored, 0);
    assert.equal(last.outflow, 45.87);
    assert.equal(last.actualOutflow, 45.87);
    await budget.saveBudget('2027-05', 1000, false, false);
    await budget.applyCcPaidToggle('2027-05', true);
    assert.equal((await budget.loadBudget('2027-05')).cc_paid, true);
    await budget.applyCcPaidToggle('2027-05', false);
    assert.equal((await budget.loadLoans()).cc_months_paid, 4);
    const env = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    assert.equal((await budget.loadLoans()).cc_end_month, null);
    assert.equal((await repayments.listRepaymentPlans()).find(p => p.kind === 'card').endMonth, '2027-05');
    await assert.rejects(budget.saveLoans({ ...plan, cc_end_month: '2027-06' }));
    await assert.rejects(budget.saveLoans({ ...plan, cc_payment: 45.84 }));
    env.tables.loans.cc_installments = 13;
    assert.equal(backup.validateEnvelope(env).ok, false);
  });
  await verify('Second card payment survives income autosave and copy preserves existing flags', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, cc2_payment: 100 });
    await budget.saveBudget('2026-11', 1000, false, false);
    await budget.applyCcPaidToggle('2026-11', true, 2);
    await budget.saveBudget('2026-11', 1100, false, false);
    assert.equal((await budget.loadBudget('2026-11')).cc2_paid, true);
    const copied = await budget.copyBudgetFromMonth('2026-11', '2026-12');
    assert.equal(copied.budget.cc2_paid, false);
    await budget.applyCcPaidToggle('2026-12', true, 2);
    const existing = await budget.copyBudgetFromMonth('2026-11', '2026-12');
    assert.equal(existing.budget.cc2_paid, true);
  });
  await verify('A failed second card toggle rolls back its payment counter', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, cc2_payment: 100 });
    await budget.saveBudget('2026-11', 1000, false, false);
    failOn = sql => sql.startsWith('UPDATE budgets SET cc2_paid');
    await assert.rejects(budget.applyCcPaidToggle('2026-11', true, 2));
    assert.equal((await budget.loadLoans()).cc2_months_paid, 0);
    assert.equal((await budget.loadBudget('2026-11')).cc2_paid, false);
  });
  await verify('Backup converts both cards, payment schedules, and independent paid flags', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, cc_payment: 150, cc2_name: 'Second card', cc2_balance: 1300, cc2_payment: 100, cc2_start_month: '2026-11', cc2_end_month: '2027-11' });
    await budget.saveBudget('2026-11', 1000, false, false);
    await budget.applyCcPaidToggle('2026-11', true, 2);
    const env = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    const plans = await repayments.listRepaymentPlans();
    assert.equal(plans.length, 2);
    assert.equal(plans.find(p => p.name === 'Credit Card').payment, 150);
    assert.equal(plans.find(p => p.name === 'Second card').startMonth, '2026-11');
    assert.equal(plans.find(p => p.name === 'Second card').endMonth, '2027-11');
    assert.equal(plans.find(p => p.name === 'Second card').monthsPaid, 1);
    assert.deepEqual([...await repayments.paidRepaymentIds('2026-11')], [plans.find(p => p.name === 'Second card').id]);
    assert.equal((await budget.loadBudget('2026-11')).cc2_paid, false);
    assert.equal((await budget.loadBudget('2026-11')).cc_paid, false);
  });
  await verify('Legacy backups restore with an empty second card and unrestricted first card', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, loan_amount: 1200, loan_term: 12, loan_months_paid: 3, cc_balance: 1200, cc_payment: 150 });
    await budget.saveBudget('2026-11', 1000, false, false);
    const env = await backup.buildBackupEnvelope();
    for (const key of Object.keys(env.tables.loans)) {
      if (key.startsWith('cc2_') || key === 'cc_start_month' || key === 'cc_end_month' || key.startsWith('loan_schedule_') || key === 'loan_start_month' || key === 'loan_end_month') delete env.tables.loans[key];
    }
    delete env.tables.budgets[0].cc2_paid;
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    const plans = await repayments.listRepaymentPlans();
    assert.equal(plans.length, 2);
    assert.equal(plans.find(p => p.kind === 'card').payment, 150);
    assert.equal(plans.find(p => p.kind === 'card').unbounded, true);
    assert.equal(plans.find(p => p.kind === 'loan').amount, 1200);
    assert.equal(plans.find(p => p.kind === 'loan').monthsPaid, 3);
    assert.equal(repayments.repaymentForMonth(plans.find(p => p.kind === 'loan'), '2028-01'), 100);
    assert.equal((await budget.loadBudget('2026-11')).cc2_paid, false);
  });
  await verify('Loan schedules and inline names survive backup restore', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, loan_payment: 180, loan_term: 13, loan_schedule_mode: 'dates', loan_start_month: '2026-11', loan_end_month: '2027-11', cc_payment: 75 });
    await budget.saveDebtName('loan', 'Car loan');
    await budget.saveDebtName(1, 'Visa');
    const env = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    const plans = await repayments.listRepaymentPlans();
    const loan = plans.find(p => p.kind === 'loan');
    const card = plans.find(p => p.kind === 'card');
    assert.equal(loan.startMonth, '2026-11');
    assert.equal(loan.endMonth, '2027-11');
    assert.equal(loan.payment, 180);
    assert.equal(loan.name, 'Car loan');
    assert.equal(card.name, 'Visa');
    assert.equal(card.payment, 75);
  });
  await verify('Invalid loan ranges are rejected without changing saved data', async () => {
    await budget.saveLoans({ ...budget.EMPTY_LOANS, loan_amount: 1200, loan_term: 12 });
    await assert.rejects(budget.saveLoans({ ...budget.EMPTY_LOANS, loan_payment: 100, loan_term: 2, loan_schedule_mode: 'dates', loan_start_month: '2026-11', loan_end_month: '2026-11' }));
    assert.equal((await budget.loadLoans()).loan_amount, 1200);
    const env = await backup.buildBackupEnvelope();
    env.tables.loans.loan_schedule_mode = 'dates';
    env.tables.loans.loan_start_month = '2026-11';
    env.tables.loans.loan_end_month = '2026-11';
    assert.equal(backup.validateEnvelope(env).ok, false);
  });
  await verify('Invalid second card data and reversed schedules are rejected at boundaries', async () => {
    await assert.rejects(budget.saveLoans({ ...budget.EMPTY_LOANS, cc2_payment: -1 }));
    await assert.rejects(budget.saveLoans({ ...budget.EMPTY_LOANS, cc2_start_month: '2027-11', cc2_end_month: '2026-11' }));
    const env = await backup.buildBackupEnvelope();
    env.tables.loans = { ...budget.EMPTY_LOANS, cc2_payment: 100, cc2_start_month: '2026-13' };
    assert.equal(backup.validateEnvelope(env).ok, false);
    env.tables.loans = { ...budget.EMPTY_LOANS, cc2_payment: '100' };
    assert.equal(backup.validateEnvelope(env).ok, false);
  });
  await verify('Demo cleanup preserves a second card configured by the user', async () => {
    await sample.seedSampleData();
    const loans = await budget.loadLoans();
    await budget.saveLoans({ ...loans, cc2_payment: 100, cc2_name: 'My card' });
    await sample.clearSampleData();
    assert.equal((await budget.loadLoans()).cc2_payment, 100);
    assert.equal((await budget.loadLoans()).cc2_name, 'My card');
  });
  await verify('Demo cleanup removes untouched rows but preserves edited notes and checklist items', async () => {
    await sample.seedSampleData();
    const record = JSON.parse(stored.get('app_sample_data_state'));
    await executor.execute('UPDATE notes SET title = ? WHERE id = ?', ['My note', record.noteIds[0]]);
    await executor.execute('UPDATE note_items SET checked = 1 WHERE note_id = ? AND position = 0', [record.noteIds[1]]);
    await sample.clearSampleData();
    assert.equal((await executor.get('SELECT title FROM notes WHERE id = ?', [record.noteIds[0]])).title, 'My note');
    assert.equal((await executor.get('SELECT COUNT(*) AS count FROM note_items WHERE note_id = ?', [record.noteIds[1]])).count, 4);
    assert.equal(await sample.hasSampleData(), false);
  });
  await verify('Demo cleanup preserves edited months and user auto deposits', async () => {
    await sample.seedSampleData();
    const record = JSON.parse(stored.get('app_sample_data_state'));
    const firstMonth = record.months[0];
    const secondMonth = record.months[1];
    const firstBudget = await budget.loadBudget(firstMonth);
    await budget.addExpense(firstBudget.id, 'My expense', 42, false);
    await executor.execute('INSERT INTO savings_auto_deposits(month, amount) VALUES (?, ?)', [secondMonth, 75]);
    await sample.clearSampleData();
    assert.ok(await budget.loadBudget(firstMonth));
    assert.equal((await executor.get('SELECT COUNT(*) AS count FROM expenses WHERE budget_id = ?', [firstBudget.id])).count, 5);
    assert.equal((await executor.get('SELECT amount FROM savings_auto_deposits WHERE month = ?', [secondMonth])).amount, 75);
    assert.equal(await budget.loadBudget(secondMonth), null);
  });
  await verify('Restoring an intentionally empty backup does not reseed demo data', async () => {
    await sample.seedSampleData();
    const empty = await backup.buildBackupEnvelope();
    for (const rows of Object.values(empty.tables)) {
      if (Array.isArray(rows)) rows.length = 0;
    }
    empty.tables.loans = null;
    empty.tables.savingsGoal = null;
    await backup.importBackupFromJson(JSON.stringify(empty));
    assert.equal(await sample.shouldSeedSampleData(), false);
    assert.equal(await sample.hasSampleData(), false);
  });
  await verify('Backup exports prune old cache files and import reads remove picker copies', async () => {
    for (let day = 1; day <= 4; day++) {
      new FakeFile(`cache/personal-hub-backup-2026-01-0${day}T00-00-00-000Z.json`).write('{}');
    }
    new FakeFile('cache/unrelated.json').write('keep');
    const exported = await backup.exportBackupToFile();
    assert.equal(files.has(exported), true);
    assert.equal([...files.keys()].filter(uri => uri.startsWith('cache/personal-hub-backup-')).length, 3);
    assert.equal(files.get('cache/unrelated.json'), 'keep');
    new FakeFile('cache/picker-import.json').write('{"example":true}');
    assert.equal(await backup.readJsonFromFileUri('cache/picker-import.json'), '{"example":true}');
    assert.equal(files.has('cache/picker-import.json'), false);
    new FakeFile('document/user-backup.json').write('{"example":true}');
    await backup.readJsonFromFileUri('document/user-backup.json');
    assert.equal(files.has('document/user-backup.json'), true);
  });
  await verify('Closing after an inactive year preserves earlier savings', async () => {
    await savings.addTransaction('deposit', 'Initial savings', 100, '2023-06-01');
    await savings.closeYear(2023, 'Closing balance 2023');
    await savings.addTransaction('deposit', 'New savings', 50, '2025-06-01');
    assert.equal((await savings.getSavingsSummary()).balance, 150);
    await savings.closeYear(2025, 'Closing balance 2025');
    assert.equal((await savings.getSavingsSummary()).balance, 150);
  });
  await verify('Editing a closed year refreshes carry-forward', async () => {
    const entry = await savings.addTransaction('deposit', 'Initial savings', 100, '2023-06-01');
    await savings.closeYear(2023, 'Closing balance 2023');
    await savings.updateTransaction(entry.id, { amount: 150 });
    assert.equal((await savings.getSavingsSummary()).balance, 150);
    assert.equal((await savings.listTransactions()).find(t => t.id === entry.id).amount, 150);
  });
  await verify('Closed balances refresh after auto-deposit changes and date moves', async () => {
    await executor.execute('INSERT INTO savings_auto_deposits(month, amount) VALUES (?, ?)', ['2023-06', 100]);
    await savings.closeYear(2023, 'Closing balance 2023');
    await savings.updateAutoDeposit('2023-06', { amount: 150 });
    assert.equal((await savings.getSavingsSummary()).balance, 150);
    const entry = await savings.addTransaction('deposit', 'Backdated', 25, '2023-07-01');
    assert.equal((await savings.getSavingsSummary()).balance, 175);
    await savings.updateTransaction(entry.id, { date: '2025-07-01' });
    assert.equal((await savings.getSavingsSummary()).balance, 175);
    await savings.deleteAutoDeposit('2023-06');
    assert.equal((await savings.getSavingsSummary()).balance, 25);
  });
  await verify('Backup rejects duplicate budget IDs', async () => {
    const env = await backup.buildBackupEnvelope();
    env.tables.budgets = [{ id: 1, month: '2026-08', income: 100 }, { id: 1, month: '2026-09', income: 100 }];
    env.tables.expenses = [{ budget_id: 1, category: 'August rent', amount: 50 }];
    assert.equal(backup.validateEnvelope(env).ok, false);
  });
  await verify('Backup rejects conflicting expense references and duplicate note IDs', async () => {
    const env = await backup.buildBackupEnvelope();
    env.tables.budgets = [{ id: 1, month: '2026-08', income: 100 }, { id: 2, month: '2026-09', income: 100 }];
    env.tables.expenses = [{ budget_id: 1, budget_month: '2026-09', category: 'Rent', amount: 50 }];
    assert.equal(backup.validateEnvelope(env).ok, false);
    env.tables.expenses = [];
    env.tables.notes = [{ id: 1, title: 'A', content: '', kind: 'text', is_pinned: 0, color: 'default', created_at: '', updated_at: '' }, { id: 1, title: 'B', content: '', kind: 'text', is_pinned: 0, color: 'default', created_at: '', updated_at: '' }];
    assert.equal(backup.validateEnvelope(env).ok, false);
  });
  await verify('Import invalidates demo ownership before cleanup', async () => {
    stored.set('app_sample_data_state', JSON.stringify({ state: 'seeded', months: ['2026-09'], noteIds: [] }));
    const env = await backup.buildBackupEnvelope();
    env.tables.budgets = [{ id: 1, month: '2026-09', income: 5000 }];
    await backup.importBackupFromJson(JSON.stringify(env));
    assert.equal(await sample.hasSampleData(), false);
    assert.equal(await sample.clearSampleData(), false);
    assert.equal((await budget.loadBudget('2026-09')).income, 5000);
  });
  await verify('Demo seeding rechecks emptiness after acquiring the write transaction', async () => {
    const originalTransaction = dbMock.withTransaction;
    dbMock.withTransaction = async fn => {
      dbMock.withTransaction = originalTransaction;
      await budget.saveBudget('2026-09', 5000, false, false);
      return originalTransaction(fn);
    };
    try {
      await sample.seedSampleData();
    } finally {
      dbMock.withTransaction = originalTransaction;
    }
    assert.equal((await budget.loadBudget('2026-09')).income, 5000);
    assert.equal((await executor.query('SELECT * FROM notes')).length, 0);
    assert.equal(await sample.hasSampleData(), false);
  });
  await verify('Unsafe loan term is rejected and payment remains finite', async () => {
    const env = await backup.buildBackupEnvelope();
    env.tables.loans = { ...budget.EMPTY_LOANS, loan_amount: 1200, loan_term: 10000000, loan_start_date: '2026-01-01' };
    assert.equal(backup.validateEnvelope(env).ok, false);
    assert.equal(Number.isFinite(calculations.pmt(1200, 5, 10000000)), true);
    assert.equal(Number.isFinite(calculations.pmt(1200, 5, 1200)), true);
    assert.equal(calculations.remainingBalance(1200, 0, 12, 1, 200), 1000);
  });
  await verify('Version 6 migration repairs existing savings markers', async () => {
    await executor.execute('INSERT INTO savings_transactions(type, description, amount, date, is_closing) VALUES (?, ?, ?, ?, ?)', ['deposit', 'Deposit', 100, '2023-06-01', 0]);
    await executor.execute('INSERT INTO savings_transactions(type, description, amount, date, is_closing) VALUES (?, ?, ?, ?, ?)', ['deposit', '[system:closing] 2023', 100, '2024-01-01', 1]);
    await executor.execute('INSERT INTO savings_transactions(type, description, amount, date, is_closing) VALUES (?, ?, ?, ?, ?)', ['deposit', 'Deposit', 50, '2025-06-01', 0]);
    await executor.execute('INSERT INTO savings_transactions(type, description, amount, date, is_closing) VALUES (?, ?, ?, ?, ?)', ['deposit', '[system:closing] 2025', 50, '2026-01-01', 1]);
    database.exec('PRAGMA user_version = 5');
    const fakeDatabase = {
      async execAsync(sql) { database.exec(sql); },
      async getFirstAsync(sql, values = []) { return database.prepare(sql).get(...values); },
      async getAllAsync(sql, values = []) { return database.prepare(sql).all(...values); },
      async runAsync(sql, values = []) { return database.prepare(sql).run(...values); },
      async withTransactionAsync(fn) {
        database.exec('BEGIN');
        try { const result = await fn(); database.exec('COMMIT'); return result; }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    };
    const filename = path.join(root, 'src/lib/db.ts');
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    const localRequire = name => {
      if (name === 'expo-sqlite') return { openDatabaseAsync: async (_name, options) => {
        assert.equal(options.finalizeUnusedStatementsBeforeClosing, false);
        return fakeDatabase;
      } };
      if (name === './noteContent') return { contentToMarkdown: () => '' };
      if (name === './lexicalPreview') return { isLexicalJson: () => false };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      throw new Error(`Unexpected dependency: ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(localRequire, module, module.exports);
    await module.exports.initDatabase();
    const marker = database.prepare("SELECT amount FROM savings_transactions WHERE date = '2026-01-01' AND is_closing = 1").get();
    assert.equal(marker.amount, 150);
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 13);
  });
  await verify('Version 9 upgrade preserves existing debts and defaults new plan columns', async () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      for (const s of declarations.get('SCHEMA_STATEMENTS').elements) legacy.exec(s.text);
      for (const obj of declarations.get('ADDITIONAL_COLUMNS').elements) {
        const fields = Object.fromEntries(obj.properties.map(p => [p.name.getText(ast), p.initializer.text]));
        if (fields.column.startsWith('cc2_') || fields.column === 'cc_start_month' || fields.column === 'cc_end_month' || fields.column === 'cc_plan_mode' || fields.column === 'cc_installments' || fields.column === 'loan_schedule_mode' || fields.column === 'loan_start_month' || fields.column === 'loan_end_month') continue;
        if (!legacy.prepare(`PRAGMA table_info(${fields.table})`).all().some(c => c.name === fields.column)) {
          legacy.exec(`ALTER TABLE ${fields.table} ADD COLUMN ${fields.column} ${fields.definition}`);
        }
      }
      legacy.exec("INSERT INTO loans(id, cc_name, cc_balance, cc_payment, cc_months_paid) VALUES(1, 'Original card', 1200, 150, 8)");
      legacy.exec("INSERT INTO budgets(month, income, cc_paid) VALUES('2026-11', 2500, 1)");
      legacy.exec('PRAGMA user_version = 6');
      await migrationModule(legacy).initDatabase();
      const loans = legacy.prepare('SELECT * FROM loans').get();
      const row = legacy.prepare('SELECT * FROM budgets').get();
      assert.equal(loans.cc_name, 'Original card');
      assert.equal(loans.cc_payment, 150);
      assert.equal(loans.cc_months_paid, 8);
      assert.equal(loans.cc_start_month, null);
      assert.equal(loans.cc2_payment, 0);
      assert.equal(loans.cc2_start_month, null);
      assert.equal(loans.loan_schedule_mode, null);
      assert.equal(loans.loan_start_month, null);
      assert.equal(loans.loan_end_month, null);
      assert.equal(loans.cc_plan_mode, null);
      assert.equal(loans.cc_installments, 0);
      assert.equal(loans.cc2_plan_mode, null);
      assert.equal(loans.cc2_installments, 0);
      assert.equal(row.cc_paid, 1);
      assert.equal(row.cc2_paid, 0);
      assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 13);
    } finally { legacy.close(); }
  });
  await verify('Version 11 adds independent plans to an existing version 9 database without changing its debts', async () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      for (const s of declarations.get('SCHEMA_STATEMENTS').elements) {
        if (!s.text.includes('repayment_plans') && !s.text.includes('repayment_payments')) legacy.exec(s.text);
      }
      for (const obj of declarations.get('ADDITIONAL_COLUMNS').elements) {
        const fields = Object.fromEntries(obj.properties.map(p => [p.name.getText(ast), p.initializer.text]));
        if (fields.table === 'repayment_plans') continue;
        if (!legacy.prepare(`PRAGMA table_info(${fields.table})`).all().some(c => c.name === fields.column)) legacy.exec(`ALTER TABLE ${fields.table} ADD COLUMN ${fields.column} ${fields.definition}`);
      }
      legacy.exec("INSERT INTO loans(id, loan_name, loan_payment, loan_term) VALUES(1, 'Existing loan', 250, 12)");
      legacy.exec('PRAGMA user_version = 9');
      await migrationModule(legacy).initDatabase();
      assert.equal(legacy.prepare('SELECT loan_name FROM loans WHERE id = 1').get().loan_name, 'Existing loan');
      assert.equal(legacy.prepare("SELECT COUNT(*) AS count FROM repayment_plans").get().count, 0);
      assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 13);
    } finally { legacy.close(); }
  });
  await verify('Version 12 archive migration preserves existing version 11 notes, items, and savings without replaying repairs', async () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      for (const s of declarations.get('SCHEMA_STATEMENTS').elements) legacy.exec(s.text);
      for (const obj of declarations.get('ADDITIONAL_COLUMNS').elements) {
        const fields = Object.fromEntries(obj.properties.map(p => [p.name.getText(ast), p.initializer.text]));
        if (fields.column === 'is_archived') continue;
        if (!legacy.prepare(`PRAGMA table_info(${fields.table})`).all().some(c => c.name === fields.column)) legacy.exec(`ALTER TABLE ${fields.table} ADD COLUMN ${fields.column} ${fields.definition}`);
      }
      legacy.exec("INSERT INTO notes(id, title, content, plain_text, kind, is_pinned, color) VALUES(42, 'Existing', 'body', 'body', 'checklist', 1, 'pink')");
      legacy.exec("INSERT INTO note_items(note_id, text, checked, position) VALUES(42, 'Preserved', 1, 0)");
      legacy.exec("INSERT INTO savings_transactions(type, description, amount, date, is_closing) VALUES('deposit', '[system:closing]', 123, '2026-01-01', 1)");
      legacy.exec('PRAGMA user_version = 11');
      const before = legacy.prepare('SELECT * FROM notes WHERE id = 42').get();
      const originalItem = legacy.prepare('SELECT * FROM note_items').get();
      await migrationModule(legacy).initDatabase();
      assert.deepEqual({ ...legacy.prepare('SELECT * FROM notes WHERE id = 42').get() }, { ...before, is_archived: 0 });
      assert.deepEqual(legacy.prepare('SELECT * FROM note_items').get(), originalItem);
      assert.equal(legacy.prepare('SELECT amount FROM savings_transactions').get().amount, 123);
      assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 13);
      assert.throws(() => legacy.prepare('UPDATE notes SET is_archived = 2 WHERE id = 42').run());
    } finally { legacy.close(); }
  });
  await verify('FTS search keeps active/archive results separate across edits, restores, and deletion', async () => {
    await migrationModule(database).initDatabase();
    notesFtsEnabled = true;
    assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE name = 'notes_fts'").get());
    const active = await notes.createNote({ title: 'Active needle', content: 'needle', is_pinned: false });
    const archived = await notes.createChecklistNote({ title: 'Archived needle', is_pinned: true }, [{ text: 'needle', checked: false }]);
    await notes.updateNote(archived.id, { is_archived: true });
    assert.deepEqual((await notes.searchNotes('needle')).map(n => n.id), [active.id]);
    assert.deepEqual((await notes.searchNotes('needle', 'updated', undefined, true)).map(n => n.id), [archived.id]);
    await assert.rejects(notes.saveChecklistNote(archived.id, { title: 'Archived needle', is_pinned: true }, [{ text: 'blocked needle', checked: true }]));
    assert.deepEqual(await notes.searchNotes('blocked', 'updated', undefined, true), []);
    await notes.restoreNote(archived.id);
    await notes.saveChecklistNote(archived.id, { title: 'Archived needle', is_pinned: true, is_archived: true }, [{ text: 'changed needle', checked: true }]);
    assert.equal((await notes.searchNotes('changed', 'updated', undefined, true)).length, 1);
    const env = await backup.buildBackupEnvelope();
    await backup.importBackupFromJson(JSON.stringify(env));
    const restored = await notes.searchNotes('changed', 'updated', undefined, true);
    assert.equal(restored.length, 1);
    await notes.deleteNote(restored[0].id);
    assert.deepEqual(await notes.searchNotes('changed', 'updated', undefined, true), []);
  });
  await verify('Tasks validate inputs, persist edits, complete and reopen without affecting other modules', async () => {
    const input = { title: 'Plan groceries', notes: 'After work', list_id: null, due_date: null, priority: 2, repeat: 'none', reminder_time: null };
    assert.deepEqual(await tasks.loadTasks(), []);
    for (const invalid of [{ title: ' ' }, { priority: 3 }, { due_date: '2026-02-30' }, { repeat: 'daily' }, { reminder_time: '24:00' }, { list_id: 99999 }]) {
      await assert.rejects(tasks.saveTask({ ...input, ...invalid }));
    }
    const id = await tasks.saveTask(input);
    await tasks.saveTask({ ...input, title: 'Groceries', due_date: '2030-01-31', repeat: 'monthly' }, id);
    assert.equal((await tasks.loadTasks())[0].repeat_day, 31);
    await tasks.completeTask(id);
    await tasks.completeTask(id); // Duplicate completion must not create extra occurrences.
    const rows = await tasks.loadTasks();
    assert.equal(rows.length, 2);
    assert.equal(rows.find(t => t.parent_id === id).due_date, '2030-02-28');
    await tasks.reopenTask(id);
    assert.equal((await tasks.loadTasks()).length, 1);
    assert.equal((await tasks.loadTasks())[0].completed_at, null);
    await tasks.completeTask(id);
    const child = (await tasks.loadTasks()).find(t => t.parent_id === id);
    await tasks.saveTask({ ...child, title: 'Edited next occurrence' }, child.id);
    await assert.rejects(tasks.reopenTask(id), tasks.TaskUndoError);
    assert.equal((await tasks.loadTasks()).length, 2);
    await tasks.saveTask({ ...child, due_date: null, repeat: 'none' }, child.id);
    const rescheduled = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(rescheduled).ok, true);
    await backup.importBackupFromJson(JSON.stringify(rescheduled));
    assert.equal((await tasks.loadTasks()).find(t => t.id === child.id).due_date, null);
  });
  await verify('Recurring schedules preserve month-end anchors, leap years, weekly cadence and local dates', async () => {
    assert.equal(taskDates.nextTaskDate('2028-01-31', 'monthly', 31, '2028-01-31'), '2028-02-29');
    assert.equal(taskDates.nextTaskDate('2028-02-29', 'monthly', 31, '2028-02-29'), '2028-03-31');
    assert.equal(taskDates.nextTaskDate('2026-01-05', 'weekly', 5, '2026-01-20'), '2026-01-26');
    assert.equal(taskDates.nextTaskDate('2026-12-31', 'daily', 31, '2026-12-31'), '2027-01-01');
    assert.equal(taskDates.nextTaskDate('2026-03-28', 'daily', 28, '2026-03-28'), '2026-03-29');
    assert.equal(taskDates.isTaskDate('2026-02-29'), false);
    assert.equal(taskDates.isTaskDate('2028-02-29'), true);
    const id = await tasks.saveTask({ title: 'Late recurring task', notes: '', list_id: null, due_date: '2020-01-01', priority: 0, repeat: 'weekly', reminder_time: null });
    await tasks.completeTask(id);
    assert.ok((await tasks.loadTasks()).find(t => t.parent_id === id).due_date > taskDates.taskDateKey());
    await tasks.reopenTask(id);
    assert.equal((await tasks.loadTasks()).length, 1);
  });
  await verify('Recurring completion rolls back entirely if creating the next occurrence fails', async () => {
    const id = await tasks.saveTask({ title: 'Repeat', notes: '', list_id: null, due_date: '2030-01-01', priority: 0, repeat: 'daily', reminder_time: null });
    failOn = sql => sql.startsWith('INSERT INTO tasks');
    await assert.rejects(tasks.completeTask(id));
    failOn = null;
    const rows = await tasks.loadTasks();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].completed_at, null);
  });
  await verify('Legacy list-linked tasks remain editable after list controls are removed', async () => {
    const list = await executor.execute('INSERT INTO task_lists (name) VALUES (?)', ['Work']);
    const id = await tasks.saveTask({ title: 'Keep me', notes: '', list_id: list.lastId, due_date: null, priority: 0, repeat: 'none', reminder_time: null });
    assert.equal(await sample.isDatabaseEmpty(), false);
    await tasks.saveTask({ title: 'Still here', notes: '', list_id: list.lastId, due_date: null, priority: 0, repeat: 'none', reminder_time: null }, id);
    assert.equal((await tasks.loadTasks())[0].id, id);
    assert.equal((await tasks.loadTasks())[0].list_id, list.lastId);
    assert.equal((await tasks.loadTasks())[0].title, 'Still here');
  });
  await verify('Task backups round trip links and reminders; old backups preserve Tasks; corrupt backups cannot replace data', async () => {
    const list = await executor.execute('INSERT INTO task_lists (name) VALUES (?)', ['Personal']);
    const id = await tasks.saveTask({ title: 'Scheduled', notes: 'Keep details', list_id: list.lastId, due_date: '2030-01-31', priority: 1, repeat: 'monthly', reminder_time: '09:30' });
    await tasks.completeTask(id);
    const env = await backup.buildBackupEnvelope();
    assert.equal(backup.validateEnvelope(env).ok, true);
    await backup.importBackupFromJson(JSON.stringify(env));
    assert.deepEqual((await tasks.loadTasks()).map(t => ({ ...t })), env.tables.tasks.toSorted((a,b) => Number(a.completed_at !== null) - Number(b.completed_at !== null)).map(t => ({ ...t })));
    const legacy = JSON.parse(JSON.stringify(env));
    legacy.meta.version = 4; delete legacy.tables.tasks; delete legacy.tables.taskLists;
    await backup.importBackupFromJson(JSON.stringify(legacy));
    assert.equal((await tasks.loadTasks()).length, 2);
    for (const change of [
      e => delete e.tables.tasks,
      e => e.tables.tasks[0].due_date = '2030-02-30',
      e => e.tables.tasks[0].list_id = 99999,
      e => e.tables.tasks[0].reminder_time = '25:00',
      e => e.tables.tasks[1].parent_id = 99999,
      e => e.tables.tasks.push({ ...e.tables.tasks[0] }),
    ]) {
      const invalid = JSON.parse(JSON.stringify(env)); change(invalid);
      assert.equal(backup.validateEnvelope(invalid).ok, false);
      await assert.rejects(backup.importBackupFromJson(JSON.stringify(invalid)));
      assert.equal((await tasks.loadTasks()).length, 2);
    }
    failOn = sql => sql.startsWith('INSERT INTO tasks');
    await assert.rejects(backup.importBackupFromJson(JSON.stringify(env)));
    failOn = null;
    assert.equal((await tasks.loadTasks()).length, 2);
    const empty = JSON.parse(JSON.stringify(env)); empty.tables.tasks = []; empty.tables.taskLists = [];
    await backup.importBackupFromJson(JSON.stringify(empty));
    assert.deepEqual(await tasks.loadTasks(), []);
  });
  await verify('Task reminder reconciliation updates edits, removes completed/deleted tasks, and keeps unrelated notifications', async () => {
    const input = { title: 'Reminder', notes: '', list_id: null, due_date: '2030-01-01', priority: 0, repeat: 'none', reminder_time: '09:00' };
    const id = await tasks.saveTask(input);
    await tasks.saveTask({ ...input, title: 'Past', due_date: '2020-01-01' });
    scheduledReminders.set('unrelated', { identifier: 'unrelated', content: {} });
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(reminderPermissionRequests, 0); // Launch/resume never prompts for permission.
    assert.equal(scheduledReminders.size, 2);
    assert.equal(scheduledReminders.get(`personal-hub-task-${id}`).content.body, 'Reminder');
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(reminderSchedules, 1); // Unchanged reminders are retained.
    await tasks.saveTask({ ...input, title: 'Updated', reminder_time: '10:30' }, id);
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.get(`personal-hub-task-${id}`).content.body, 'Updated');
    assert.equal(scheduledReminders.get(`personal-hub-task-${id}`).trigger.date.getHours(), 10);
    assert.equal(scheduledReminders.get(`personal-hub-task-${id}`).trigger.date.getMinutes(), 30);
    await tasks.completeTask(id);
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 1);
    await tasks.reopenTask(id);
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 2);
    await tasks.deleteTask(id);
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 1);
    assert.equal(scheduledReminders.has('unrelated'), true);
  });
  await verify('Task reminders handle denial, missing native builds and scheduling failure without losing tasks', async () => {
    const id = await tasks.saveTask({ title: 'Keep me', notes: '', list_id: null, due_date: '2030-01-01', priority: 0, repeat: 'none', reminder_time: '09:00' });
    reminderNativeAvailable = false;
    assert.equal(await taskReminders.requestTaskReminderPermission('Task reminders'), 'unavailable');
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 0);
    reminderNativeAvailable = true;
    reminderPermission = { granted: false, canAskAgain: false };
    assert.equal(await taskReminders.requestTaskReminderPermission('Task reminders'), 'denied');
    assert.equal(reminderPermissionRequests, 0);
    reminderPermission = { granted: false, canAskAgain: true };
    assert.equal(await taskReminders.requestTaskReminderPermission('Task reminders'), 'denied');
    assert.equal(reminderPermissionRequests, 1);
    reminderPermission = { granted: true, canAskAgain: true };
    reminderScheduleFailure = true;
    await assert.rejects(taskReminders.syncTaskReminders('Task reminders'));
    assert.equal((await tasks.loadTasks())[0].id, id);
    reminderScheduleFailure = false;
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 1);
    reminderPermission = { granted: false, canAskAgain: false };
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 0);
  });
  await verify('Task reminder queue survives rapid edits and schedules only the nearest 50', async () => {
    const input = { title: 'Many reminders', notes: '', list_id: null, due_date: '2030-01-01', priority: 0, repeat: 'none', reminder_time: '09:00' };
    for (let index = 0; index < 52; index++) await tasks.saveTask({ ...input, title: `Reminder ${index}` });
    await Promise.all([taskReminders.syncTaskReminders('Task reminders'), taskReminders.syncTaskReminders('Task reminders')]);
    assert.equal(scheduledReminders.size, 50);
    assert.equal(reminderSchedules, 50);
    const first = (await tasks.loadTasks()).find(t => t.title === 'Reminder 0');
    await tasks.completeTask(first.id);
    await taskReminders.syncTaskReminders('Task reminders');
    assert.equal(scheduledReminders.size, 50);
    assert.equal(scheduledReminders.has(`personal-hub-task-${first.id}`), false);
  });
  await verify('Version 13 creates Tasks in an existing version 12 database without rewriting older module data', async () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      for (const s of declarations.get('SCHEMA_STATEMENTS').elements) {
        if (/\btask_lists\b|\btasks\b/.test(s.text)) continue;
        legacy.exec(s.text);
      }
      for (const obj of declarations.get('ADDITIONAL_COLUMNS').elements) {
        const fields = Object.fromEntries(obj.properties.map(p => [p.name.getText(ast), p.initializer.text]));
        if (!legacy.prepare(`PRAGMA table_info(${fields.table})`).all().some(c => c.name === fields.column)) legacy.exec(`ALTER TABLE ${fields.table} ADD COLUMN ${fields.column} ${fields.definition}`);
      }
      legacy.exec("INSERT INTO notes (title, content, is_archived) VALUES ('Preserve', 'body', 1)");
      legacy.exec('PRAGMA user_version = 12');
      const original = legacy.prepare('SELECT * FROM notes').get();
      await migrationModule(legacy).initDatabase();
      assert.deepEqual(legacy.prepare('SELECT * FROM notes').get(), original);
      assert.equal(legacy.prepare('SELECT COUNT(*) AS count FROM tasks').get().count, 0);
      assert.equal(legacy.prepare('SELECT COUNT(*) AS count FROM task_lists').get().count, 0);
      assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 13);
    } finally { legacy.close(); }
  });
  results.push(...await require('./updater-cache-regression.cjs')(root));
  console.log(JSON.stringify({ source: root, fixture: 'Disposable in-memory SQLite; native APIs mocked', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => database.close());
