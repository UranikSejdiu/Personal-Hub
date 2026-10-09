import * as SQLite from "expo-sqlite";

type BindValue = string | number | null | Uint8Array;
let database: SQLite.SQLiteDatabase | null = null;
let initialization: Promise<SQLite.SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (initialization) return initialization;
  initialization = (async () => {
    const opened = await SQLite.openDatabaseAsync("dhikr_data", {
      finalizeUnusedStatementsBeforeClosing: false,
    });
    try {
      await opened.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await opened.withTransactionAsync(async () => {
        await opened.execAsync(`CREATE TABLE IF NOT EXISTS dhikrs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          total_count INTEGER NOT NULL DEFAULT 0,
          daily_count INTEGER NOT NULL DEFAULT 0,
          daily_limit INTEGER,
          last_reset_date TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_dhikrs_sort_order ON dhikrs(sort_order);
        PRAGMA user_version = 1;`);
      });
      database = opened;
      return opened;
    } catch (error) {
      await opened.closeAsync();
      throw error;
    }
  })().catch((error: unknown) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

export interface DbExecutor {
  query<T = Record<string, unknown>>(sql: string, values?: BindValue[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, values?: BindValue[]): Promise<T | undefined>;
  execute(sql: string, values?: BindValue[]): Promise<{ changes: number; lastId: number }>;
}

function executor(connection: SQLite.SQLiteDatabase): DbExecutor {
  return {
    query: (sql, values = []) => connection.getAllAsync(sql, ...values),
    async get(sql, values = []) {
      return (await connection.getFirstAsync(sql, ...values)) ?? undefined;
    },
    async execute(sql, values = []) {
      const result = await connection.runAsync(sql, ...values);
      return { changes: result.changes, lastId: result.lastInsertRowId };
    },
  };
}

async function connection(): Promise<SQLite.SQLiteDatabase> {
  return database ?? initDatabase();
}

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task);
  writeQueue = result.then(() => {}, () => {});
  return result;
}

export async function query<T = Record<string, unknown>>(sql: string, values?: BindValue[]): Promise<T[]> {
  return executor(await connection()).query<T>(sql, values);
}

export async function get<T = Record<string, unknown>>(sql: string, values?: BindValue[]): Promise<T | undefined> {
  return executor(await connection()).get<T>(sql, values);
}

export async function execute(sql: string, values?: BindValue[]) {
  return enqueueWrite(async () => executor(await connection()).execute(sql, values));
}

export async function withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return enqueueWrite(async () => {
    const opened = await connection();
    let result: T | undefined;
    await opened.withExclusiveTransactionAsync(async (tx) => {
      result = await fn(executor(tx));
    });
    return result as T;
  });
}
