import * as db from "./db";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { APP_VERSION } from "../constants/config";

export const BACKUP_FORMAT = "personal-hub.backup";
export const BACKUP_VERSION = 1;

export interface BackupEnvelope {
  meta: {
    format: typeof BACKUP_FORMAT;
    version: number;
    appVersion: string;
    exportedAt: string;
    platform: string;
  };
  tables: {
    loans: Record<string, unknown> | null;
    savingsGoal: Record<string, unknown> | null;
    budgets: Record<string, unknown>[];
    expenses: Record<string, unknown>[];
    recurringExpenses: Record<string, unknown>[];
    autoDeposits: Record<string, unknown>[];
    transactions: Record<string, unknown>[];
    dhikrs: Record<string, unknown>[];
    notes: Record<string, unknown>[];
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isValidMonth(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
}

function isValidDate(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function validateLoans(row: Record<string, unknown>): string | null {
  if (row.id !== 1 && row.id !== undefined) return "loans.id must be 1";
  return null;
}

function validateBudget(row: Record<string, unknown>): string | null {
  if (!isValidMonth(row.month)) return "budget.month invalid";
  if (typeof row.income !== "number" && typeof row.income !== "string") return "budget.income invalid";
  return null;
}

function validateExpense(row: Record<string, unknown>): string | null {
  if (typeof row.category !== "string") return "expense.category invalid";
  if (typeof row.amount !== "number" && typeof row.amount !== "string") return "expense.amount invalid";
  return null;
}

export function validateEnvelope(raw: unknown): { ok: true; data: BackupEnvelope } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: "Root must be object" };
  const meta = raw.meta as Record<string, unknown> | undefined;
  if (!isObject(meta)) return { ok: false, error: "Missing meta" };
  if (meta.format !== BACKUP_FORMAT) return { ok: false, error: `Invalid format ${String(meta.format)}` };
  if (typeof meta.version !== "number" || meta.version !== BACKUP_VERSION) return { ok: false, error: `Unsupported version ${String(meta.version)}` };
  const tables = raw.tables as Record<string, unknown> | undefined;
  if (!isObject(tables)) return { ok: false, error: "Missing tables" };

  // Light validation — per-row deeper checks happen during import
  const requiredArrays = ["budgets", "expenses", "recurringExpenses", "autoDeposits", "transactions", "dhikrs", "notes"] as const;
  for (const k of requiredArrays) {
    if (!Array.isArray(tables[k])) return { ok: false, error: `tables.${k} must be array` };
  }

  // Optional singletons can be null or object
  if (tables.loans !== null && tables.loans !== undefined && !isObject(tables.loans as unknown)) return { ok: false, error: "tables.loans invalid" };
  if (tables.savingsGoal !== null && tables.savingsGoal !== undefined && !isObject(tables.savingsGoal as unknown)) return { ok: false, error: "tables.savingsGoal invalid" };

  // Detect accidental .db file pick: JSON parse would have thrown already, but guard SQLite header if base64
  // Real SQLite header check is done on file read before JSON parse (see import flow).

  return { ok: true, data: raw as unknown as BackupEnvelope };
}

export async function buildBackupEnvelope(): Promise<BackupEnvelope> {
  const [loansRow, savingsGoalRow, budgets, expenses, recurringExpenses, autoDeposits, transactions, dhikrs, notes] =
    await Promise.all([
      db.get<Record<string, unknown>>("SELECT * FROM loans WHERE id = 1"),
      db.get<Record<string, unknown>>("SELECT * FROM savings_goals WHERE id = 1"),
      db.query<Record<string, unknown>>("SELECT * FROM budgets ORDER BY month"),
      db.query<Record<string, unknown>>("SELECT * FROM expenses ORDER BY id"),
      db.query<Record<string, unknown>>("SELECT * FROM recurring_expenses ORDER BY id"),
      db.query<Record<string, unknown>>("SELECT * FROM savings_auto_deposits ORDER BY month"),
      db.query<Record<string, unknown>>("SELECT * FROM savings_transactions ORDER BY id"),
      db.query<Record<string, unknown>>("SELECT * FROM dhikrs ORDER BY sort_order, id"),
      db.query<Record<string, unknown>>("SELECT * FROM notes ORDER BY id"),
    ]);

  return {
    meta: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      platform: Platform.OS,
    },
    tables: {
      loans: loansRow ?? null,
      savingsGoal: savingsGoalRow ?? null,
      budgets,
      expenses,
      recurringExpenses,
      autoDeposits,
      transactions,
      dhikrs,
      notes,
    },
  };
}

export async function exportBackupToFile(): Promise<string> {
  const envelope = await buildBackupEnvelope();
  const json = JSON.stringify(envelope, null, 2);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `personal-hub-backup-${ts}.json`;
  const file = new File(Paths.cache, name);
  // File.write is available on new FS API; fallback to legacy if needed
  const anyFile = file as unknown as { write: (c: string) => Promise<void>; text?: () => Promise<string> };
  if (typeof anyFile.write === "function") {
    await anyFile.write(json);
  } else {
    // Should not happen, but guard
    throw new Error("File write not supported");
  }
  return file.uri;
}

export async function shareBackupFile(uri: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Sharing not available on this device");
  await Sharing.shareAsync(uri, {
    mimeType: "application/json",
    dialogTitle: "Personal Hub Backup",
    UTI: "public.json",
  });
}

export async function exportAndShareBackup(): Promise<string> {
  const uri = await exportBackupToFile();
  await shareBackupFile(uri);
  return uri;
}

export type ImportMode = "replace";

export async function importBackupFromJson(jsonStr: string, mode: ImportMode = "replace"): Promise<void> {
  // Quick SQLite header guard: if user picked a .db file, first bytes are "SQLite format 3"
  if (jsonStr.startsWith("SQLite format 3")) {
    throw new Error("Invalid backup: SQLite file selected instead of JSON");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error("Invalid JSON");
  }
  const validated = validateEnvelope(raw);
  if (!validated.ok) throw new Error(validated.error);
  const env = validated.data;

  // Per-row sanity before touching DB
  for (const b of env.tables.budgets) {
    const e = validateBudget(b as Record<string, unknown>);
    if (e) throw new Error(e);
  }
  for (const ex of env.tables.expenses) {
    const e = validateExpense(ex as Record<string, unknown>);
    if (e) throw new Error(e);
  }

  // Single-row validation
  if (env.tables.loans) {
    const e = validateLoans(env.tables.loans as Record<string, unknown>);
    if (e) throw new Error(e);
  }

  if (mode !== "replace") throw new Error("Only replace mode supported");

  await db.withTransaction(async () => {
    // Clear in FK-safe order
    await db.execute("DELETE FROM expenses");
    await db.execute("DELETE FROM budgets");
    await db.execute("DELETE FROM recurring_expenses");
    await db.execute("DELETE FROM savings_auto_deposits");
    await db.execute("DELETE FROM savings_transactions");
    await db.execute("DELETE FROM dhikrs");
    await db.execute("DELETE FROM notes");
    await db.execute("DELETE FROM loans");
    await db.execute("DELETE FROM savings_goals");

    // Restore singletons
    if (env.tables.loans) {
      const r = env.tables.loans as Record<string, unknown>;
      await db.execute(
        `INSERT INTO loans (id, loan_amount, loan_rate, loan_term, loan_payment, loan_start_date, loan_payment_day, loan_months_paid, cc_balance, cc_apr, cc_payment, cc_months_paid) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(r.loan_amount) || 0,
          Number(r.loan_rate) || 0,
          Number(r.loan_term) || 0,
          Number(r.loan_payment) || 0,
          (r.loan_start_date as string | null) ?? null,
          Number(r.loan_payment_day) || 1,
          Number(r.loan_months_paid) || 0,
          Number(r.cc_balance) || 0,
          Number(r.cc_apr) || 0,
          Number(r.cc_payment) || 0,
          Number(r.cc_months_paid) || 0,
        ]
      );
    }

    if (env.tables.savingsGoal) {
      const r = env.tables.savingsGoal as Record<string, unknown>;
      await db.execute(`INSERT INTO savings_goals (id, goal_amount, salary) VALUES (1, ?, ?)`, [
        Number(r.goal_amount) || 0,
        Number(r.salary) || 0,
      ]);
    }

    // Restore budgets and build month->id map for expenses
    const monthToId = new Map<string, number>();
    for (const b of env.tables.budgets) {
      const row = b as Record<string, unknown>;
      const month = String(row.month);
      if (!isValidMonth(month)) continue;
      const res = await db.execute(
        `INSERT INTO budgets (month, income, loan_paid, cc_paid, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [
          month,
          Number(row.income) || 0,
          Number(row.loan_paid) ? 1 : 0,
          Number(row.cc_paid) ? 1 : 0,
          (row.updated_at as string) || new Date().toISOString(),
        ]
      );
      // get inserted id via lastId or lookup
      let newId = res.lastId;
      if (!newId) {
        const found = await db.get<Record<string, unknown>>("SELECT id FROM budgets WHERE month = ?", [month]);
        newId = Number(found?.id) || 0;
      }
      if (newId) monthToId.set(month, newId);
    }

    // If expenses carry budget_id from old DB, try to resolve via month join
    // Export stores old budget_id, but we have budgets array to map old id -> month
    const oldIdToMonth = new Map<number, string>();
    for (const b of env.tables.budgets) {
      const row = b as Record<string, unknown>;
      if (row.id !== undefined && row.month) oldIdToMonth.set(Number(row.id), String(row.month));
    }

    for (const ex of env.tables.expenses) {
      const row = ex as Record<string, unknown>;
      let targetBudgetId: number | null = null;
      // Prefer budget_month if present (future-proof), else map old budget_id
      if (row.budget_month && typeof row.budget_month === "string" && monthToId.has(row.budget_month)) {
        targetBudgetId = monthToId.get(row.budget_month)!;
      } else if (row.budget_id !== undefined) {
        const month = oldIdToMonth.get(Number(row.budget_id));
        if (month) targetBudgetId = monthToId.get(month) ?? null;
      }
      // Fallback: try category/amount dedup not needed — skip orphan expenses
      if (!targetBudgetId) continue;
      await db.execute(
        `INSERT INTO expenses (budget_id, category, amount, paid, is_recurring) VALUES (?, ?, ?, ?, ?)`,
        [
          targetBudgetId,
          String(row.category ?? ""),
          Number(row.amount) || 0,
          Number(row.paid) ? 1 : 0,
          Number(row.is_recurring) ? 1 : 0,
        ]
      );
    }

    for (const r of env.tables.recurringExpenses) {
      const row = r as Record<string, unknown>;
      await db.execute(`INSERT INTO recurring_expenses (category, amount) VALUES (?, ?)`, [
        String(row.category ?? ""),
        Number(row.amount) || 0,
      ]);
    }

    for (const r of env.tables.autoDeposits) {
      const row = r as Record<string, unknown>;
      const month = String(row.month ?? "");
      if (!isValidMonth(month)) continue;
      await db.execute(`INSERT INTO savings_auto_deposits (month, amount) VALUES (?, ?)`, [
        month,
        Number(row.amount) || 0,
      ]);
    }

    for (const r of env.tables.transactions) {
      const row = r as Record<string, unknown>;
      const t = String(row.type);
      if (t !== "deposit" && t !== "purchase") continue;
      const date = String(row.date ?? "");
      if (!isValidDate(date) && !isValidMonth(date)) continue;
      await db.execute(
        `INSERT INTO savings_transactions (type, description, amount, date) VALUES (?, ?, ?, ?)`,
        [t, String(row.description ?? ""), Number(row.amount) || 0, date]
      );
    }

    for (const r of env.tables.dhikrs) {
      const row = r as Record<string, unknown>;
      if (!row.name) continue;
      await db.execute(
        `INSERT INTO dhikrs (name, total_count, daily_count, daily_limit, last_reset_date, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.name),
          Number(row.total_count) || 0,
          Number(row.daily_count) || 0,
          row.daily_limit !== null && row.daily_limit !== undefined ? Number(row.daily_limit) : null,
          String(row.last_reset_date ?? new Date().toISOString().slice(0, 10)),
          Number(row.sort_order) || 0,
          String(row.created_at ?? new Date().toISOString()),
        ]
      );
    }

    for (const r of env.tables.notes) {
      const row = r as Record<string, unknown>;
      await db.execute(
        `INSERT INTO notes (title, content, is_pinned, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(row.title ?? ""),
          String(row.content ?? ""),
          Number(row.is_pinned) ? 1 : 0,
          String(row.color ?? "default"),
          String(row.created_at ?? new Date().toISOString()),
          String(row.updated_at ?? new Date().toISOString()),
        ]
      );
    }
  });
}

export async function readJsonFromFileUri(uri: string): Promise<string> {
  // Use new File API
  const file = new File(uri);
  const anyFile = file as unknown as { text: () => Promise<string>; exists: boolean };
  if (!anyFile.exists) throw new Error("File not found");
  // Expo FS File.text() reads utf8
  if (typeof anyFile.text === "function") {
    const content = await anyFile.text();
    // SQLite header guard
    if (content.startsWith("SQLite format 3")) throw new Error("Invalid backup: SQLite file");
    return content;
  }
  throw new Error("Cannot read file");
}
