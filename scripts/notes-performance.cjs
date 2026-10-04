// Benchmark the actual paginated notes helper on host SQLite, without native APIs
// or user data. These timings are not a substitute for device profiling.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const schemaSource = fs.readFileSync(path.join(root, 'src/lib/db.ts'), 'utf8');
const ast = ts.createSourceFile('db.ts', schemaSource, ts.ScriptTarget.Latest, true);
const declarations = new Map();
for (const statement of ast.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) declarations.set(declaration.name.getText(ast), declaration.initializer);
  }
}
const database = new DatabaseSync(':memory:');
for (const statement of declarations.get('SCHEMA_STATEMENTS').elements) database.exec(statement.text);
for (const obj of declarations.get('ADDITIONAL_COLUMNS').elements) {
  const fields = Object.fromEntries(obj.properties.map(p => [p.name.getText(ast), p.initializer.text]));
  if (!database.prepare(`PRAGMA table_info(${fields.table})`).all().some(c => c.name === fields.column)) database.exec(`ALTER TABLE ${fields.table} ADD COLUMN ${fields.column} ${fields.definition}`);
}
const datasetSize = 20000;
const insert = database.prepare('INSERT INTO notes(title, content, plain_text, kind, is_pinned, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
database.exec('BEGIN');
for (let i = 0; i < datasetSize; i++) {
  const date = `2026-09-${String(i % 28 + 1).padStart(2, '0')} 12:00:00`;
  insert.run(`Note ${String(datasetSize - i).padStart(5, '0')}`, 'body '.repeat(400), `needle preview ${i}`, 'text', i % 13 === 0 ? 1 : 0, i % 10 === 0 ? 1 : 0, date, date);
}
database.exec('COMMIT');
let lastListQuery;
const dbMock = {
  isNotesFtsEnabled: () => false,
  query: async (sql, values = []) => {
    if (sql.includes('AS content')) lastListQuery = { sql, values };
    return database.prepare(sql).all(...values);
  },
};
const filename = path.join(root, 'src/lib/notes.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const notesModule = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(name => {
  if (name === './db') return dbMock;
  if (name === './noteContent') return { contentToMarkdown: content => content };
  if (name === './lexicalPreview') return { isLexicalJson: () => false };
  throw new Error(`Unexpected dependency: ${name}`);
}, notesModule, notesModule.exports);
const notes = notesModule.exports;
const snapshots = new Map();
async function measure(stage) {
  const results = [];
  for (const archived of [false, true]) {
    for (const sort of ['updated', 'created', 'title']) {
      const key = `${archived}:${sort}`;
      const page = await notes.loadNotesPage('', sort, 400, 40, archived);
      const ids = page.notes.map(note => note.id);
      if (stage === 'before') snapshots.set(key, ids);
      else assert.deepEqual(ids, snapshots.get(key), 'Index changes must preserve ordering and pagination');
      assert.equal(page.notes.length, 40);
      assert.ok(page.notes.every(note => note.is_archived === archived));
      const plan = database.prepare(`EXPLAIN QUERY PLAN ${lastListQuery.sql}`).all(...lastListQuery.values).map(row => row.detail);
      const times = [];
      for (let sample = 0; sample < 40; sample++) {
        const start = performance.now();
        await notes.loadNotesPage('', sort, 400, 40, archived);
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      if (stage === 'after') assert.ok(!plan.some(detail => detail.includes('TEMP B-TREE')), `Unexpected sorting work for ${key}`);
      results.push({ view: archived ? 'archive' : 'notes', sort, medianMs: Number(times[20].toFixed(3)), plan });
    }
  }
  return results;
}
(async () => {
  const before = await measure('before');
  const indexes = declarations.get('NOTES_ARCHIVE_INDEXES');
  if (!indexes) {
    console.log(JSON.stringify({ fixture: `${datasetSize} disposable notes; host SQLite; real notes helper`, before }, null, 2));
    return;
  }
  for (const statement of indexes.elements) database.exec(statement.text);
  const after = await measure('after');
  console.log(JSON.stringify({ fixture: `${datasetSize} disposable notes; host SQLite; real notes helper`, before, after, orderingPreserved: true }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => database.close());
