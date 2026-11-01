import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../constants/config";
type BindValue = string | number | null | Uint8Array;
let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let notesFtsEnabled = false;
const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS notes (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    title TEXT NOT NULL DEFAULT '',\n    content TEXT NOT NULL DEFAULT '',\n    is_pinned INTEGER NOT NULL DEFAULT 0,\n    color TEXT NOT NULL DEFAULT 'default',\n    plain_text TEXT NOT NULL DEFAULT '',\n    created_at TEXT NOT NULL DEFAULT (datetime('now')),\n    updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned);",
  "CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);",
  "CREATE INDEX IF NOT EXISTS idx_notes_pin_updated ON notes(is_pinned, updated_at);",
  "CREATE TABLE IF NOT EXISTS note_items (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,\n    text TEXT NOT NULL DEFAULT '',\n    checked INTEGER NOT NULL DEFAULT 0,\n    position INTEGER NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL DEFAULT (datetime('now')),\n    updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE INDEX IF NOT EXISTS idx_note_items_note ON note_items(note_id, position);"
];
const ADDITIONAL_COLUMNS = [
  {
    "table": "notes",
    "column": "plain_text",
    "definition": "TEXT NOT NULL DEFAULT ''"
  },
  {
    "table": "notes",
    "column": "kind",
    "definition": "TEXT NOT NULL DEFAULT 'text'"
  },
  {
    "table": "notes",
    "column": "is_archived",
    "definition": "INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))"
  }
];
const INDEXES: string[] = ["CREATE INDEX IF NOT EXISTS idx_notes_archive_updated ON notes(is_archived, is_pinned DESC, updated_at DESC, id DESC);","CREATE INDEX IF NOT EXISTS idx_notes_archive_created ON notes(is_archived, is_pinned DESC, created_at DESC, id DESC);","CREATE INDEX IF NOT EXISTS idx_notes_archive_title ON notes(is_archived, is_pinned DESC, title COLLATE NOCASE ASC, id DESC);"];
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const connection = await SQLite.openDatabaseAsync(DB_NAME, { finalizeUnusedStatementsBeforeClosing: false });
    try {
      await connection.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await connection.withTransactionAsync(async () => {
        const version = await connection.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
        if ((version?.user_version ?? 0) >= 1) return;
        for (const sql of SCHEMA_STATEMENTS) await connection.execAsync(sql);
        for (const { table, column, definition } of ADDITIONAL_COLUMNS) {
          const columns = await connection.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
          if (!columns.some(existing => existing.name === column)) await connection.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
        for (const sql of INDEXES) await connection.execAsync(sql);

        try {
          await connection.execAsync("CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, plain_text, content='notes', content_rowid='id')");
          await connection.execAsync("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
          await connection.execAsync("CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text); END;");
          await connection.execAsync("CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text); END;");
          await connection.execAsync("CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text); INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text); END;");
        } catch {
          for (const name of ["notes_fts_ai", "notes_fts_ad", "notes_fts_au"]) await connection.execAsync(`DROP TRIGGER IF EXISTS ${name}`);
          await connection.execAsync("DROP TABLE IF EXISTS notes_fts");
        }
        await connection.execAsync("PRAGMA user_version = 1");
      });
      await connection.withTransactionAsync(async () => {
        const columns = await connection.getAllAsync<{ name: string }>("PRAGMA table_info(notes)");
        if (!columns.some(column => column.name === "attachments")) {
          await connection.execAsync("ALTER TABLE notes ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'");
        }
        const version = await connection.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
        if ((version?.user_version ?? 0) < 2) await connection.execAsync("PRAGMA user_version = 2");
      });
      await connection.withTransactionAsync(async () => {
        const version = await connection.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
        if ((version?.user_version ?? 0) >= 3) return;
        await connection.execAsync("ALTER TABLE notes ADD COLUMN attachment_count INTEGER NOT NULL DEFAULT 0");
        // Parse media JSON once on writes, rather than scanning megabytes for
        // every card in every list page. Triggers also cover imported backups.
        await connection.execAsync("UPDATE notes SET attachment_count = CASE WHEN json_valid(attachments) THEN json_array_length(attachments) ELSE 0 END");
        for (const event of ["INSERT", "UPDATE OF attachments"]) {
          const suffix = event === "INSERT" ? "ai" : "au";
          await connection.execAsync(`CREATE TRIGGER notes_attachment_count_${suffix} AFTER ${event} ON notes BEGIN UPDATE notes SET attachment_count = json_array_length(new.attachments) WHERE id = new.id; END`);
        }
        if (await connection.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'")) {
          await connection.execAsync("DROP TRIGGER IF EXISTS notes_fts_au");
          await connection.execAsync("CREATE TRIGGER notes_fts_au AFTER UPDATE OF title, plain_text ON notes BEGIN INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text); INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text); END;");
        }
        await connection.execAsync("PRAGMA user_version = 3");
      });
      notesFtsEnabled = Boolean(await connection.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'"));
      db = connection;
      return connection;
    } catch (error) {
      await connection.closeAsync().catch(() => {});
      throw error;
    }
  })();
  try { return await initPromise; }
  catch (error) { initPromise = null; throw error; }
}
async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  return initDatabase();
}

/** Whether this database has FTS5 full-text search available for notes. */
export function isNotesFtsEnabled(): boolean {
  return notesFtsEnabled;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<T[]> {
  return defaultExecutor.query<T>(sql, values);
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<T | undefined> {
  return defaultExecutor.get<T>(sql, values);
}

export async function execute(
  sql: string,
  values?: unknown[]
): Promise<{ changes: number; lastId: number }> {
  return defaultExecutor.execute(sql, values);
}

/**
 * A connection-scoped query surface. The default executor sends writes through
 * the serialization queue; the executor handed to a transaction writes directly
 * on that transaction's own connection.
 */
export interface DbExecutor {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T | undefined>;
  execute(sql: string, values?: unknown[]): Promise<{ changes: number; lastId: number }>;
}

function createExecutor(
  connection: SQLite.SQLiteDatabase,
  serializeWrites: boolean
): DbExecutor {
  const runWrite = async (
    sql: string,
    values?: unknown[]
  ): Promise<{ changes: number; lastId: number }> => {
    const params = (values ?? []) as BindValue[];
    const result = await connection.runAsync(sql, ...params);
    return { changes: result.changes, lastId: result.lastInsertRowId };
  };

  return {
    async query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]> {
      const params = (values ?? []) as BindValue[];
      return connection.getAllAsync<T>(sql, ...params);
    },
    async get<T = Record<string, unknown>>(
      sql: string,
      values?: unknown[]
    ): Promise<T | undefined> {
      const params = (values ?? []) as BindValue[];
      const result = await connection.getFirstAsync<T>(sql, ...params);
      return result ?? undefined;
    },
    execute(sql: string, values?: unknown[]) {
      if (!serializeWrites) return runWrite(sql, values);
      return enqueueWrite(() => runWrite(sql, values));
    },
  };
}

let defaultExecutorInternal: DbExecutor | null = null;

async function resolveDefaultExecutor(): Promise<DbExecutor> {
  if (defaultExecutorInternal) return defaultExecutorInternal;
  defaultExecutorInternal = createExecutor(await getDb(), true);
  return defaultExecutorInternal;
}

/**
 * Stable handle to the default connection. Safe to use as a default argument:
 * it resolves the underlying executor lazily on first use.
 */
export const defaultExecutor: DbExecutor = {
  async query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ): Promise<T[]> {
    return (await resolveDefaultExecutor()).query<T>(sql, values);
  },
  async get<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ): Promise<T | undefined> {
    return (await resolveDefaultExecutor()).get<T>(sql, values);
  },
  async execute(sql: string, values?: unknown[]) {
    return (await resolveDefaultExecutor()).execute(sql, values);
  },
};

/**
 * Serialize every write and every transaction onto one queue. Reads are not
 * serialized: in WAL mode they do not block, and a reader cannot observe a
 * half-written row because writers never run concurrently with each other.
 *
 * Without this queue a write issued while a transaction is open would join that
 * transaction on the shared connection and be rolled back with it, silently
 * losing the write. See {@link withTransaction}.
 */
function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  return (async () => {
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  })();
}

/**
 * Run `fn` inside an exclusive transaction.
 *
 * Every statement in the callback must go through the executor it receives
 * (`tx`). `withExclusiveTransactionAsync` uses a connection of its own, so a
 * stray statement on the default helpers would run outside the transaction —
 * and, because writes are queued behind it, would deadlock. Transactions and
 * single writes are serialized together by `enqueueWrite`, so an unrelated write
 * can never be captured by this transaction and rolled back with it.
 */
export async function withTransaction<T>(
  fn: (tx: DbExecutor) => Promise<T>
): Promise<T> {
  const database = await getDb();
  return enqueueWrite(async () => {
    let result: T | undefined;
    await database.withExclusiveTransactionAsync(async (txn) => {
      result = await fn(createExecutor(txn, false));
    });
    return result as T;
  });
}
