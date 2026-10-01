import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../constants/config";
import { contentToMarkdown } from "./noteContent";
import { isLexicalJson } from "./lexicalPreview";

type BindValue = string | number | null | Uint8Array;

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let notesFtsEnabled = false;

const SCHEMA_VERSION = 9;

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    loan_amount REAL NOT NULL DEFAULT 0,
    loan_rate REAL NOT NULL DEFAULT 0,
    loan_term INTEGER NOT NULL DEFAULT 0,
    loan_payment REAL NOT NULL DEFAULT 0,
    loan_start_date TEXT,
    loan_payment_day INTEGER NOT NULL DEFAULT 1,
    loan_months_paid INTEGER NOT NULL DEFAULT 0,
    cc_balance REAL NOT NULL DEFAULT 0,
    cc_apr REAL NOT NULL DEFAULT 0,
    cc_payment REAL NOT NULL DEFAULT 0,
    cc_months_paid INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    income REAL NOT NULL DEFAULT 0,
    loan_paid INTEGER NOT NULL DEFAULT 0,
    cc_paid INTEGER NOT NULL DEFAULT 0,
    loan_counter_incremented INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    paid INTEGER NOT NULL DEFAULT 0,
    is_recurring INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_budget_id ON expenses(budget_id);`,
  `CREATE TABLE IF NOT EXISTS dhikrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    total_count INTEGER NOT NULL DEFAULT 0,
    daily_count INTEGER NOT NULL DEFAULT 0,
    daily_limit INTEGER,
    last_reset_date TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_dhikrs_sort_order ON dhikrs(sort_order);`,
  `CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    goal_amount REAL NOT NULL DEFAULT 0,
    salary REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS savings_auto_deposits (
    month TEXT PRIMARY KEY,
    amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS savings_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('deposit','purchase')),
    description TEXT NOT NULL DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_savings_tx_date ON savings_transactions(date);`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    is_pinned INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT 'default',
    plain_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned);`,
  `CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);`,
  `CREATE INDEX IF NOT EXISTS idx_notes_pin_updated ON notes(is_pinned, updated_at);`,
  `CREATE TABLE IF NOT EXISTS note_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_note_items_note ON note_items(note_id, position);`,
];

const ADDITIONAL_COLUMNS: readonly { table: string; column: string; definition: string }[] = [
  { table: "loans", column: "cc_plan_mode", definition: "TEXT" },
  { table: "loans", column: "cc_installments", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "loans", column: "cc2_plan_mode", definition: "TEXT" },
  { table: "loans", column: "cc2_installments", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "loans", column: "loan_schedule_mode", definition: "TEXT" },
  { table: "loans", column: "loan_start_month", definition: "TEXT" },
  { table: "loans", column: "loan_end_month", definition: "TEXT" },
  { table: "loans", column: "cc_start_month", definition: "TEXT" },
  { table: "loans", column: "cc_end_month", definition: "TEXT" },
  { table: "loans", column: "cc2_balance", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "loans", column: "cc2_apr", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "loans", column: "cc2_payment", definition: "REAL NOT NULL DEFAULT 0" },
  { table: "loans", column: "cc2_months_paid", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "loans", column: "cc2_name", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "loans", column: "cc2_start_month", definition: "TEXT" },
  { table: "loans", column: "cc2_end_month", definition: "TEXT" },
  { table: "budgets", column: "cc2_paid", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "budgets", column: "loan_counter_incremented", definition: "INTEGER" },
  { table: "notes", column: "plain_text", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "notes", column: "kind", definition: "TEXT NOT NULL DEFAULT 'text'" },
  { table: "savings_auto_deposits", column: "description", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "loans", column: "loan_name", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "loans", column: "cc_name", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "savings_transactions", column: "is_closing", definition: "INTEGER NOT NULL DEFAULT 0" },
];

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;

  const openedDatabaseRef: { current: SQLite.SQLiteDatabase | null } = { current: null };
  initPromise = (async () => {
    // Expo's close-time statement sweep can finalize FTS5-owned statements;
    // exclusive transactions close their connection after each checklist save.
    // See https://github.com/expo/expo/issues/38168.
    const database = await SQLite.openDatabaseAsync(DB_NAME, {
      finalizeUnusedStatementsBeforeClosing: false,
    });
    openedDatabaseRef.current = database;
    await database.execAsync("PRAGMA journal_mode = WAL;");
    await database.execAsync("PRAGMA foreign_keys = ON;");

    await database.withTransactionAsync(async () => {
      // Version-gate the migration so a released, already-upgraded database
      // (user_version >= SCHEMA_VERSION) skips the idempotent work on every
      // launch. Databases from older releases report a lower version, so they
      // still take the full path once. Never write the version when nothing
      // ran — a restored file from a newer app keeps its own header intact.
      const versionRow = await database.getFirstAsync<{ user_version: number }>(
        "PRAGMA user_version;"
      );
      const userVersion = versionRow?.user_version ?? 0;
      if (userVersion >= SCHEMA_VERSION) return;

      for (const statement of SCHEMA_STATEMENTS) {
        await database.execAsync(statement);
      }

      for (const { table, column, definition } of ADDITIONAL_COLUMNS) {
        const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
        if (!columns.some((item) => item.name === column)) {
          await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
        }
      }

      await database.execAsync("CREATE INDEX IF NOT EXISTS idx_notes_plain_text ON notes(plain_text);");

      await database.execAsync(
        "UPDATE notes SET color = 'default' WHERE color != 'default';"
      );

      // v3: one-time repair of notes whose plain_text was polluted by raw
      // Lexical JSON (legacy builds stored the editor document instead of its
      // text). Runs at upgrade only — the runtime backfill no longer scans
      // every note body on each launch.
      const polluted = await database.getAllAsync<{ id: number; content: string }>(
        `SELECT id, content FROM notes
          WHERE plain_text != ''
            AND plain_text LIKE '%"root"%'
            AND plain_text LIKE '%"children"%';`
      );
      for (const row of polluted) {
        if (!isLexicalJson(row.content)) continue;
        await database.runAsync("UPDATE notes SET plain_text = ? WHERE id = ?", [
          contentToMarkdown(row.content),
          row.id,
        ]);
      }

      // v4: an indexed closing marker for savings, and FTS5 search for notes.
      await database.execAsync(
        "CREATE INDEX IF NOT EXISTS idx_savings_tx_closing ON savings_transactions(is_closing);"
      );
      await database.execAsync(
        `UPDATE savings_transactions SET is_closing = 1
          WHERE is_closing = 0
            AND (description LIKE '[system:closing]%'
              OR description LIKE '%Bilanci mbyllës%'
              OR description LIKE '%Closing balance%');`
      );

      // v6: earlier releases could write an incomplete or stale carry-forward.
      // Rebuild markers from source activity in the migration transaction so
      // an existing user's balance is repaired immediately after upgrade.
      const closingRows = await database.getAllAsync<{ id: number; date: string }>(
        "SELECT id, date FROM savings_transactions WHERE is_closing = 1 ORDER BY date, id"
      );
      for (const marker of closingRows) {
        const auto = await database.getFirstAsync<{ total: number }>(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month < ?",
          [marker.date.slice(0, 7)]
        );
        const manual = await database.getFirstAsync<{ total: number }>(
          `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0) AS total
           FROM savings_transactions WHERE is_closing = 0 AND date < ?`,
          [marker.date]
        );
        const net = Number(auto?.total ?? 0) + Number(manual?.total ?? 0);
        await database.runAsync(
          "UPDATE savings_transactions SET type = ?, amount = ? WHERE id = ?",
          [net >= 0 ? "deposit" : "purchase", Math.abs(net), marker.id]
        );
      }

      // FTS5 is optional: some SQLite builds omit it. On failure the partial
      // objects are dropped and note search falls back to LIKE, so a missing
      // FTS5 can never break the app or leave half-synced triggers behind.
      try {
        await database.execAsync(
          "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, plain_text, content='notes', content_rowid='id');"
        );
        await database.execAsync("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');");
        await database.execAsync(
          "CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN " +
            "INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text); END;"
        );
        await database.execAsync(
          "CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN " +
            "INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text); END;"
        );
        await database.execAsync(
          "CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN " +
            "INSERT INTO notes_fts(notes_fts, rowid, title, plain_text) VALUES ('delete', old.id, old.title, old.plain_text); " +
            "INSERT INTO notes_fts(rowid, title, plain_text) VALUES (new.id, new.title, new.plain_text); END;"
        );
      } catch {
        await database.execAsync("DROP TRIGGER IF EXISTS notes_fts_ai;").catch(() => {});
        await database.execAsync("DROP TRIGGER IF EXISTS notes_fts_ad;").catch(() => {});
        await database.execAsync("DROP TRIGGER IF EXISTS notes_fts_au;").catch(() => {});
        await database.execAsync("DROP TABLE IF EXISTS notes_fts;").catch(() => {});
      }

      await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });

    // Reflect reality on every launch: the migration above is version-gated, so
    // the flag cannot be set only inside it.
    const ftsTable = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts';"
    );
    notesFtsEnabled = Boolean(ftsTable);

    return database;
  })();

  try {
    const database = await initPromise;
    db = database;
    return database;
  } catch (error) {
    initPromise = null;
    const openedDatabase = openedDatabaseRef.current;
    if (openedDatabase && db !== openedDatabase) {
      try {
        await openedDatabase.closeAsync();
      } catch (closeError) {
        // Preserve the initialization error while surfacing an unexpected
        // failure to release the handle for diagnosis.
        console.warn("[db] failed to close database after initialization error:", closeError);
      }
    }
    throw error;
  }
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
