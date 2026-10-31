import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../constants/config";
type BindValue = string | number | null | Uint8Array;
let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let notesFtsEnabled = false;
const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS task_lists (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80)\n  );",
  "CREATE TABLE IF NOT EXISTS tasks (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),\n    notes TEXT NOT NULL DEFAULT '',\n    list_id INTEGER REFERENCES task_lists(id) ON DELETE SET NULL,\n    due_date TEXT,\n    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority IN (0, 1, 2)),\n    repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly', 'yearly')),\n    reminder_time TEXT,\n    repeat_day INTEGER CHECK (repeat_day BETWEEN 1 AND 31),\n    parent_id INTEGER UNIQUE REFERENCES tasks(id) ON DELETE SET NULL,\n    completed_at TEXT,\n    created_at TEXT NOT NULL DEFAULT (datetime('now')),\n    updated_at TEXT NOT NULL DEFAULT (datetime('now')),\n    CHECK (repeat = 'none' OR due_date IS NOT NULL),\n    CHECK (reminder_time IS NULL OR due_date IS NOT NULL)\n  );",
  "CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(completed_at, due_date, priority);",
  "CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(list_id, completed_at);"
];
const ADDITIONAL_COLUMNS: { table: string; column: string; definition: string }[] = [];
const INDEXES: string[] = [];
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
        await connection.execAsync("PRAGMA user_version = 1");
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
