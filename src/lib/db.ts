import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../constants/config";

type BindValue = string | number | null | Uint8Array;

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_VERSION = 1;

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
];

const ADDITIONAL_COLUMNS: readonly { table: string; column: string; definition: string }[] = [
  { table: "notes", column: "plain_text", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "savings_auto_deposits", column: "description", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "loans", column: "loan_name", definition: "TEXT NOT NULL DEFAULT ''" },
  { table: "loans", column: "cc_name", definition: "TEXT NOT NULL DEFAULT ''" },
];

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const database = await SQLite.openDatabaseAsync(DB_NAME);
    await database.execAsync("PRAGMA journal_mode = WAL;");
    await database.execAsync("PRAGMA foreign_keys = ON;");

    await database.withTransactionAsync(async () => {
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

      await database.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    });

    return database;
  })();

  try {
    const database = await initPromise;
    db = database;
    return database;
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

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const database = await getDb();
  let result: T | undefined;
  await database.withTransactionAsync(async () => {
    result = await fn();
  });
  return result as T;
}
