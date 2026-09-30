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
  ...executor, defaultExecutor: executor, isNotesFtsEnabled: () => false,
  async withTransaction(fn) {
    database.exec('BEGIN');
    try { const result = await fn(executor); database.exec('COMMIT'); return result; }
    catch (e) { database.exec('ROLLBACK'); throw e; }
  },
};
const stored = new Map();
const files = new Map();
class FakeFile {
  constructor(...parts) { this.uri = parts.join('/'); }
  get exists() { return files.has(this.uri); }
  get size() { return Buffer.byteLength(files.get(this.uri) || ''); }
  write(value) { files.set(this.uri, value); }
  async text() { return files.get(this.uri); }
  delete() { files.delete(this.uri); }
  move(target) { files.set(target.uri, files.get(this.uri)); files.delete(this.uri); }
}
const mocks = {
  'expo-secure-store': {
    async getItemAsync(key) { return stored.get(key) || null; },
    async setItemAsync(key, value) { stored.set(key, value); },
    async deleteItemAsync(key) { stored.delete(key); },
  },
  'expo-application': { nativeApplicationVersion: '1.19.6' },
  'react-native': { Platform: { OS: 'android' } },
  'expo-file-system': { File: FakeFile, Paths: { document: 'document', cache: 'cache' } },
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
const notes = load(path.join(root, 'src/lib/notes.ts'));
const savings = load(path.join(root, 'src/lib/savings.ts'));
const backup = load(path.join(root, 'src/lib/backup.ts'));
const sample = load(path.join(root, 'src/lib/sampleData.ts'));
const calculations = load(path.join(root, 'src/lib/calculations.ts'));
const reset = () => {
  failOn = null;
  for (const name of ['expenses', 'budgets', 'recurring_expenses', 'savings_auto_deposits', 'savings_transactions', 'dhikrs', 'note_items', 'notes', 'loans', 'savings_goals']) database.exec(`DELETE FROM ${name}`);
  stored.clear(); files.clear();
};
const results = [];
async function verify(name, fn) { reset(); await fn(); results.push({ name, passed: true }); }
(async () => {
  await verify('Recurring population skips an existing matching expense', async () => {
    const b = await budget.saveBudget('2026-09', 1000, false, false);
    await executor.execute('INSERT INTO recurring_expenses(category, amount) VALUES (?, ?)', ['Rent', 100]);
    await budget.addExpense(b.id, 'Rent', 100, true);
    await budget.populateRecurringExpenses(b.id);
    assert.equal((await budget.listExpenses(b.id)).length, 1);
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
  await verify('Credit-card payment toggles are idempotent', async () => {
    await budget.saveBudget('2026-09', 1000, false, false);
    await budget.applyCcPaidToggle('2026-09', true);
    await budget.applyCcPaidToggle('2026-09', true);
    assert.equal((await budget.loadLoans()).cc_months_paid, 1);
    await budget.applyCcPaidToggle('2026-09', false);
    assert.equal((await budget.loadLoans()).cc_months_paid, 0);
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
      if (name === 'expo-sqlite') return { openDatabaseAsync: async () => fakeDatabase };
      if (name === './noteContent') return { contentToMarkdown: () => '' };
      if (name === './lexicalPreview') return { isLexicalJson: () => false };
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      throw new Error(`Unexpected dependency: ${name}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename })(localRequire, module, module.exports);
    await module.exports.initDatabase();
    const marker = database.prepare("SELECT amount FROM savings_transactions WHERE date = '2026-01-01' AND is_closing = 1").get();
    assert.equal(marker.amount, 150);
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 6);
  });
  console.log(JSON.stringify({ source: root, fixture: 'Disposable in-memory SQLite; native APIs mocked', results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => database.close());
