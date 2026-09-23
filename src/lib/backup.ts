import * as db from "./db";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { getAppVersion } from "../constants/config";
import { NOTE_COLORS } from "../constants/theme";

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
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false;
  return true;
}

function isValidDate(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === v;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v);
}

function requiredString(row: Record<string, unknown>, key: string): boolean {
  return typeof row[key] === "string";
}

function optionalString(row: Record<string, unknown>, key: string): boolean {
  return row[key] === undefined || typeof row[key] === "string";
}

function optionalId(row: Record<string, unknown>): boolean {
  return row.id === undefined || (isInteger(row.id) && row.id > 0);
}

function validateLoans(row: Record<string, unknown>): string | null {
  if (row.id !== undefined && row.id !== 1) return "loans.id must be 1";
  for (const key of ["loan_amount", "loan_rate", "loan_term", "loan_payment", "loan_payment_day", "loan_months_paid", "cc_balance", "cc_apr", "cc_payment", "cc_months_paid"]) {
    if (!isFiniteNumber(row[key])) return `loans.${key} invalid`;
  }
  if (row.loan_start_date !== null && row.loan_start_date !== undefined && !isValidDate(row.loan_start_date)) return "loans.loan_start_date invalid";
  if (!optionalString(row, "loan_name") || !optionalString(row, "cc_name")) return "loans names invalid";
  return null;
}

function validateSavingsGoal(row: Record<string, unknown>): string | null {
  if (row.id !== undefined && row.id !== 1) return "savingsGoal.id must be 1";
  if (!isFiniteNumber(row.goal_amount) || !isFiniteNumber(row.salary)) return "savingsGoal numeric fields invalid";
  return null;
}

function validateBudget(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !isValidMonth(row.month) || !isFiniteNumber(row.income)) return "budget fields invalid";
  if (row.loan_paid !== undefined && !isInteger(row.loan_paid)) return "budget.loan_paid invalid";
  if (row.cc_paid !== undefined && !isInteger(row.cc_paid)) return "budget.cc_paid invalid";
  if (!optionalString(row, "updated_at")) return "budget.updated_at invalid";
  return null;
}

function validateExpense(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "category") || !isFiniteNumber(row.amount)) return "expense fields invalid";
  if (row.budget_id !== undefined && !isInteger(row.budget_id)) return "expense.budget_id invalid";
  if (row.budget_month !== undefined && !isValidMonth(row.budget_month)) return "expense.budget_month invalid";
  if (row.budget_id === undefined && row.budget_month === undefined) return "expense has no budget reference";
  for (const key of ["paid", "is_recurring"]) if (row[key] !== undefined && !isInteger(row[key])) return `expense.${key} invalid`;
  return null;
}

function validateRecurringExpense(row: Record<string, unknown>): string | null {
  return !optionalId(row) || !requiredString(row, "category") || !isFiniteNumber(row.amount) ? "recurring expense fields invalid" : null;
}

function validateAutoDeposit(row: Record<string, unknown>): string | null {
  return !isValidMonth(row.month) || !isFiniteNumber(row.amount) || !optionalString(row, "description") ? "auto deposit fields invalid" : null;
}

function validateTransaction(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || (row.type !== "deposit" && row.type !== "purchase") || !requiredString(row, "description") || !isFiniteNumber(row.amount)) return "transaction fields invalid";
  if (!isValidDate(row.date) && !isValidMonth(row.date)) return "transaction.date invalid";
  return null;
}

function validateDhikr(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "name") || !isInteger(row.total_count) || !isInteger(row.daily_count) || !isInteger(row.sort_order)) return "dhikr fields invalid";
  if (row.daily_limit !== null && !isInteger(row.daily_limit)) return "dhikr.daily_limit invalid";
  if (!isValidDate(row.last_reset_date) || !requiredString(row, "created_at")) return "dhikr dates invalid";
  return null;
}

function validateNote(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "title") || !requiredString(row, "content") || !optionalString(row, "plain_text")) return "note text fields invalid";
  if (!isInteger(row.is_pinned) || typeof row.color !== "string" || !(row.color in NOTE_COLORS)) return "note fields invalid";
  if (!requiredString(row, "created_at") || !requiredString(row, "updated_at")) return "note dates invalid";
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

  const requiredArrays = ["budgets", "expenses", "recurringExpenses", "autoDeposits", "transactions", "dhikrs", "notes"] as const;
  for (const k of requiredArrays) {
    if (!Array.isArray(tables[k])) return { ok: false, error: `tables.${k} must be array` };
  }

  // Optional singletons can be null or object
  if (tables.loans !== null && tables.loans !== undefined && (!isObject(tables.loans) || validateLoans(tables.loans))) return { ok: false, error: "tables.loans invalid" };
  if (tables.savingsGoal !== null && tables.savingsGoal !== undefined && (!isObject(tables.savingsGoal) || validateSavingsGoal(tables.savingsGoal))) return { ok: false, error: "tables.savingsGoal invalid" };

  const validators = { budgets: validateBudget, expenses: validateExpense, recurringExpenses: validateRecurringExpense, autoDeposits: validateAutoDeposit, transactions: validateTransaction, dhikrs: validateDhikr, notes: validateNote } as const;
  for (const key of requiredArrays) {
    const rows = tables[key];
    if (!Array.isArray(rows)) return { ok: false, error: `tables.${key} must be array` };
    for (const [index, value] of rows.entries()) {
      if (!isObject(value)) return { ok: false, error: `tables.${key}[${index}] must be object` };
      const error = validators[key](value);
      if (error) return { ok: false, error: `tables.${key}[${index}]: ${error}` };
    }
  }

  const budgets = tables.budgets as Record<string, unknown>[];
  const budgetMonths = new Set<string>();
  const budgetIds = new Set<number>();
  for (const budget of budgets) {
    budgetMonths.add(budget.month as string);
    if (budget.id !== undefined) budgetIds.add(budget.id as number);
  }
  if (budgetMonths.size !== budgets.length) return { ok: false, error: "Duplicate budget month" };
  for (const expense of tables.expenses as Record<string, unknown>[]) {
    const hasMonth = expense.budget_month !== undefined && budgetMonths.has(expense.budget_month as string);
    const hasId = expense.budget_id !== undefined && budgetIds.has(expense.budget_id as number);
    if (!hasMonth && !hasId) return { ok: false, error: "Expense references a missing budget" };
  }
  const autoDepositMonths = (tables.autoDeposits as Record<string, unknown>[]).map((row) => row.month as string);
  if (new Set(autoDepositMonths).size !== autoDepositMonths.length) return { ok: false, error: "Duplicate auto deposit month" };

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
      appVersion: getAppVersion(),
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

export async function importBackupFromJson(jsonStr: string): Promise<void> {
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

  // Keep a restorable copy before the first destructive statement. If it cannot
  // be created, abort rather than proceeding without the safety copy.
  await exportBackupToFile();

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
        `INSERT INTO loans (id, loan_amount, loan_rate, loan_term, loan_payment, loan_start_date, loan_payment_day, loan_months_paid, loan_name, cc_balance, cc_apr, cc_payment, cc_months_paid, cc_name) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.loan_amount as number,
          r.loan_rate as number,
          r.loan_term as number,
          r.loan_payment as number,
          (r.loan_start_date as string | null) ?? null,
          Number(r.loan_payment_day) || 1,
          r.loan_months_paid as number,
          String(r.loan_name ?? ""),
          r.cc_balance as number,
          r.cc_apr as number,
          r.cc_payment as number,
          r.cc_months_paid as number,
          String(r.cc_name ?? ""),
        ]
      );
    }

    if (env.tables.savingsGoal) {
      const r = env.tables.savingsGoal as Record<string, unknown>;
      await db.execute(`INSERT INTO savings_goals (id, goal_amount, salary) VALUES (1, ?, ?)`, [
        r.goal_amount as number,
        r.salary as number,
      ]);
    }

    // Restore budgets and build month->id map for expenses
    const monthToId = new Map<string, number>();
    for (const b of env.tables.budgets) {
      const row = b as Record<string, unknown>;
      const month = row.month as string;
      const res = await db.execute(
        `INSERT INTO budgets (month, income, loan_paid, cc_paid, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [
          month,
          row.income as number,
          row.loan_paid ? 1 : 0,
          row.cc_paid ? 1 : 0,
          (row.updated_at as string) || new Date().toISOString(),
        ]
      );
      // get inserted id via lastId or lookup
      let newId = res.lastId;
      if (!newId) {
        const found = await db.get<Record<string, unknown>>("SELECT id FROM budgets WHERE month = ?", [month]);
        newId = typeof found?.id === "number" ? found.id : 0;
      }
      if (newId) monthToId.set(month, newId);
    }

    // If expenses carry budget_id from old DB, try to resolve via month join
    // Export stores old budget_id, but we have budgets array to map old id -> month
    const oldIdToMonth = new Map<number, string>();
    for (const b of env.tables.budgets) {
      const row = b as Record<string, unknown>;
      if (row.id !== undefined) oldIdToMonth.set(row.id as number, row.month as string);
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
      if (!targetBudgetId) throw new Error("Invalid backup: expense references a missing budget");
      await db.execute(
        `INSERT INTO expenses (budget_id, category, amount, paid, is_recurring) VALUES (?, ?, ?, ?, ?)`,
        [
          targetBudgetId,
          String(row.category ?? ""),
          row.amount as number,
          row.paid ? 1 : 0,
          row.is_recurring ? 1 : 0,
        ]
      );
    }

    for (const r of env.tables.recurringExpenses) {
      const row = r as Record<string, unknown>;
      await db.execute(`INSERT INTO recurring_expenses (category, amount) VALUES (?, ?)`, [
        String(row.category ?? ""),
        row.amount as number,
      ]);
    }

    for (const r of env.tables.autoDeposits) {
      const row = r as Record<string, unknown>;
      const month = row.month as string;
      await db.execute(`INSERT INTO savings_auto_deposits (month, amount, description) VALUES (?, ?, ?)`, [
        month,
        row.amount as number,
        String(row.description ?? ""),
      ]);
    }

    for (const r of env.tables.transactions) {
      const row = r as Record<string, unknown>;
      const t = row.type as "deposit" | "purchase";
      const date = row.date as string;
      await db.execute(
        `INSERT INTO savings_transactions (type, description, amount, date) VALUES (?, ?, ?, ?)`,
        [t, row.description as string, row.amount as number, date]
      );
    }

    for (const r of env.tables.dhikrs) {
      const row = r as Record<string, unknown>;
      await db.execute(
        `INSERT INTO dhikrs (name, total_count, daily_count, daily_limit, last_reset_date, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.name as string,
          row.total_count as number,
          row.daily_count as number,
          row.daily_limit as number | null,
          row.last_reset_date as string,
          row.sort_order as number,
          row.created_at as string,
        ]
      );
    }

    for (const r of env.tables.notes) {
      const row = r as Record<string, unknown>;
      await db.execute(
        `INSERT INTO notes (title, content, is_pinned, color, plain_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.title as string,
          row.content as string,
          row.is_pinned ? 1 : 0,
          row.color as string,
          (row.plain_text as string | undefined) ?? "",
          row.created_at as string,
          row.updated_at as string,
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
