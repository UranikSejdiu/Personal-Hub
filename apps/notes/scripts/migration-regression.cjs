const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

module.exports = async function checkMigration(root, load) {
  for (const fts of [true, false]) {
    const sqlite = new DatabaseSync(':memory:');
    try {
      // A real v2 database, including an existing media note and the old FTS trigger.
      sqlite.exec(`CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, content TEXT, plain_text TEXT, is_pinned INTEGER, is_archived INTEGER, color TEXT, kind TEXT, created_at TEXT, updated_at TEXT, attachments TEXT NOT NULL DEFAULT '[]');
        PRAGMA user_version = 2;`);
      const media = JSON.stringify([{ id: 'existing-media', name: 'Document.pdf', mimeType: 'application/pdf', kind: 'file', base64: 'cGRm' }]);
      sqlite.prepare("INSERT INTO notes VALUES (42, 'Legacy note', '<p>Keep me</p>', 'Keep me', 1, 0, 'default', 'text', '2026-01-01', '2026-01-02', ?)").run(media);
      for (let id = 100; id < 170; id++) {
        sqlite.prepare("INSERT INTO notes(id,title,content,plain_text) VALUES (?, 'Index', ?, '')").run(id, id === 169 ? '<p></p>' : '<p>Index me</p>');
      }
      if (fts) sqlite.exec(`CREATE VIRTUAL TABLE notes_fts USING fts5(title, plain_text, content='notes', content_rowid='id');
        INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');
        CREATE TRIGGER notes_fts_au AFTER UPDATE ON notes BEGIN INSERT INTO notes_fts(notes_fts,rowid,title,plain_text) VALUES('delete',old.id,old.title,old.plain_text); INSERT INTO notes_fts(rowid,title,plain_text) VALUES(new.id,new.title,new.plain_text); END;`);
      const original = sqlite.prepare('SELECT * FROM notes WHERE id = 42').get();
      const connection = {
        runAsync: async (sql, ...values) => sqlite.prepare(sql).run(...values),
        execAsync: async sql => sqlite.exec(sql),
        getFirstAsync: async (sql, ...values) => sqlite.prepare(sql).get(...values),
        getAllAsync: async (sql, ...values) => sqlite.prepare(sql).all(...values),
        withTransactionAsync: async fn => { sqlite.exec('BEGIN'); try { await fn(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } },
        closeAsync: async () => {},
      };
      const source = fs.readFileSync(path.join(root, 'src/lib/db.ts'), 'utf8');
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const module = { exports: {} };
      const requireMock = name => name === 'expo-sqlite' ? { openDatabaseAsync: async () => connection } : name === './noteContent' ? load(path.join(root, 'src/lib/noteContent.ts')) : { DB_NAME: 'notes_data' };
      vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: 'db-migration' })(requireMock, module, module.exports);
      await module.exports.initDatabase(); await module.exports.initDatabase();
      const actual = sqlite.prepare('SELECT * FROM notes WHERE id = 42').get();
      assert.equal(actual.attachment_count, 1);
      assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM notes WHERE plain_text='Index me'").get().n, 69);
      assert.equal(sqlite.prepare('SELECT plain_text FROM notes WHERE id=169').get().plain_text, '');
      delete actual.attachment_count; assert.deepEqual(actual, original, 'Upgrade preserves all existing note fields');
      assert.equal(sqlite.prepare('PRAGMA user_version').get().user_version, 5);
      assert.deepEqual(sqlite.prepare('SELECT * FROM note_drafts').all(), []);
      sqlite.exec("UPDATE notes SET attachments = '[]' WHERE id = 42");
      assert.equal(sqlite.prepare('SELECT attachment_count FROM notes WHERE id = 42').get().attachment_count, 0);
      if (fts) {
        sqlite.exec("UPDATE notes SET title = 'Updated title' WHERE id = 42");
        assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM notes_fts WHERE notes_fts MATCH 'Updated'").get().n, 1);
        sqlite.exec("INSERT INTO notes_fts(notes_fts,rank) VALUES ('integrity-check',1)");
      }
    } finally { sqlite.close(); }
  }
  console.log('Passed v2 → v5 upgrades: existing media preserved, derived counts updated, idempotent startup and FTS/fallback integrity.');
};
