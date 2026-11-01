import * as SQLite from "expo-sqlite";
import { DB_NAME } from "../constants/config";
type BindValue = string | number | null | Uint8Array;
let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS repayment_plans (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    kind TEXT NOT NULL CHECK (kind IN ('loan', 'card')),\n    name TEXT NOT NULL DEFAULT '',\n    amount REAL NOT NULL,\n    apr REAL NOT NULL DEFAULT 0,\n    payment REAL NOT NULL DEFAULT 0,\n    term INTEGER NOT NULL,\n    months_paid INTEGER NOT NULL DEFAULT 0,\n    start_month TEXT NOT NULL,\n    end_month TEXT,\n    unbounded INTEGER NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE TABLE IF NOT EXISTS repayment_payments (\n    plan_id INTEGER NOT NULL REFERENCES repayment_plans(id) ON DELETE CASCADE,\n    month TEXT NOT NULL,\n    counted INTEGER NOT NULL DEFAULT 0 CHECK (counted IN (0, 1)),\n    PRIMARY KEY (plan_id, month)\n  );",
  "CREATE INDEX IF NOT EXISTS idx_repayment_payments_month ON repayment_payments(month);",
  "CREATE TABLE IF NOT EXISTS loans (\n    id INTEGER PRIMARY KEY CHECK (id = 1),\n    loan_amount REAL NOT NULL DEFAULT 0,\n    loan_rate REAL NOT NULL DEFAULT 0,\n    loan_term INTEGER NOT NULL DEFAULT 0,\n    loan_payment REAL NOT NULL DEFAULT 0,\n    loan_start_date TEXT,\n    loan_payment_day INTEGER NOT NULL DEFAULT 1,\n    loan_months_paid INTEGER NOT NULL DEFAULT 0,\n    cc_balance REAL NOT NULL DEFAULT 0,\n    cc_apr REAL NOT NULL DEFAULT 0,\n    cc_payment REAL NOT NULL DEFAULT 0,\n    cc_months_paid INTEGER NOT NULL DEFAULT 0,\n    updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE TABLE IF NOT EXISTS budgets (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    month TEXT NOT NULL UNIQUE,\n    income REAL NOT NULL DEFAULT 0,\n    loan_paid INTEGER NOT NULL DEFAULT 0,\n    cc_paid INTEGER NOT NULL DEFAULT 0,\n    loan_counter_incremented INTEGER,\n    updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE TABLE IF NOT EXISTS expenses (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,\n    category TEXT NOT NULL,\n    amount REAL NOT NULL DEFAULT 0,\n    paid INTEGER NOT NULL DEFAULT 0,\n    is_recurring INTEGER NOT NULL DEFAULT 0\n  );",
  "CREATE INDEX IF NOT EXISTS idx_expenses_budget_id ON expenses(budget_id);",
  "CREATE TABLE IF NOT EXISTS savings_goals (\n    id INTEGER PRIMARY KEY CHECK (id = 1),\n    goal_amount REAL NOT NULL DEFAULT 0,\n    salary REAL NOT NULL DEFAULT 0,\n    updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE TABLE IF NOT EXISTS recurring_expenses (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    category TEXT NOT NULL,\n    amount REAL NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE TABLE IF NOT EXISTS savings_auto_deposits (\n    month TEXT PRIMARY KEY,\n    amount REAL NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE TABLE IF NOT EXISTS savings_transactions (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    type TEXT NOT NULL CHECK (type IN ('deposit','purchase')),\n    description TEXT NOT NULL DEFAULT '',\n    amount REAL NOT NULL DEFAULT 0,\n    date TEXT NOT NULL,\n    created_at TEXT NOT NULL DEFAULT (datetime('now'))\n  );",
  "CREATE INDEX IF NOT EXISTS idx_savings_tx_date ON savings_transactions(date);"
];
const ADDITIONAL_COLUMNS = [
  {
    "table": "budgets",
    "column": "savings_goal",
    "definition": "REAL NOT NULL DEFAULT 0"
  },
  {
    "table": "repayment_plans",
    "column": "end_month",
    "definition": "TEXT"
  },
  {
    "table": "repayment_plans",
    "column": "unbounded",
    "definition": "INTEGER NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "cc_plan_mode",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "cc_installments",
    "definition": "INTEGER NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "cc2_plan_mode",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "cc2_installments",
    "definition": "INTEGER NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "loan_schedule_mode",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "loan_start_month",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "loan_end_month",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "cc_start_month",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "cc_end_month",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "cc2_balance",
    "definition": "REAL NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "cc2_apr",
    "definition": "REAL NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "cc2_payment",
    "definition": "REAL NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "cc2_months_paid",
    "definition": "INTEGER NOT NULL DEFAULT 0"
  },
  {
    "table": "loans",
    "column": "cc2_name",
    "definition": "TEXT NOT NULL DEFAULT ''"
  },
  {
    "table": "loans",
    "column": "cc2_start_month",
    "definition": "TEXT"
  },
  {
    "table": "loans",
    "column": "cc2_end_month",
    "definition": "TEXT"
  },
  {
    "table": "budgets",
    "column": "cc2_paid",
    "definition": "INTEGER NOT NULL DEFAULT 0"
  },
  {
    "table": "budgets",
    "column": "loan_counter_incremented",
    "definition": "INTEGER"
  },
  {
    "table": "savings_auto_deposits",
    "column": "description",
    "definition": "TEXT NOT NULL DEFAULT ''"
  },
  {
    "table": "loans",
    "column": "loan_name",
    "definition": "TEXT NOT NULL DEFAULT ''"
  },
  {
    "table": "loans",
    "column": "cc_name",
    "definition": "TEXT NOT NULL DEFAULT ''"
  },
  {
    "table": "savings_transactions",
    "column": "is_closing",
    "definition": "INTEGER NOT NULL DEFAULT 0"
  }
];
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
