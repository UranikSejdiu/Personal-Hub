import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../constants/config";

type BindValue = string | number | null | Uint8Array;

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: string[] = [
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned);`,
  `CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);`,
];

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const database = await SQLite.openDatabaseAsync(DB_NAME);
    await database.execAsync("PRAGMA journal_mode = WAL;");
    await database.execAsync("PRAGMA foreign_keys = ON;");

    for (const statement of MIGRATIONS) {
      try {
        await database.execAsync(statement);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("duplicate column")) throw e;
      }
    }

    db = database;
    return database;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  return initDatabase();
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<T[]> {
  const database = await getDb();
  const params = (values ?? []) as BindValue[];
  return database.getAllAsync<T>(sql, ...params);
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  values?: unknown[]
): Promise<T | undefined> {
  const database = await getDb();
  const params = (values ?? []) as BindValue[];
  const result = await database.getFirstAsync<T>(sql, ...params);
  return result ?? undefined;
}

export async function execute(
  sql: string,
  values?: unknown[]
): Promise<{ changes: number; lastId: number }> {
  const database = await getDb();
  const params = (values ?? []) as BindValue[];
  const result = await database.runAsync(sql, ...params);
  return {
    changes: result.changes,
    lastId: result.lastInsertRowId,
  };
}

let transactionDepth = 0;

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const database = await getDb();
  transactionDepth++;
  try {
    if (transactionDepth > 1) {
      await database.execAsync(`SAVEPOINT sp_${transactionDepth};`);
    } else {
      await database.execAsync("BEGIN TRANSACTION;");
    }
    const result = await fn();
    if (transactionDepth > 1) {
      await database.execAsync(`RELEASE SAVEPOINT sp_${transactionDepth};`);
    } else {
      await database.execAsync("COMMIT;");
    }
    return result;
  } catch (error) {
    try {
      if (transactionDepth > 1) {
        await database.execAsync(`ROLLBACK TO SAVEPOINT sp_${transactionDepth};`);
        await database.execAsync(`RELEASE SAVEPOINT sp_${transactionDepth};`);
      } else {
        await database.execAsync("ROLLBACK;");
      }
    } catch {
      // Rollback already handled
    }
    throw error;
  } finally {
    transactionDepth--;
  }
}

export async function closeDatabase(): Promise<void> {
  if (transactionDepth > 0) {
    const start = Date.now();
    while (transactionDepth > 0 && Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (transactionDepth > 0) {
      throw new Error("Cannot close database while a transaction is active.");
    }
  }
  transactionDepth = 0;
  if (db) {
    await db.closeAsync();
    db = null;
    initPromise = null;
  }
}
