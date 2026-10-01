import * as db from "./db";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { getAppVersion } from "../constants/config";
import { NOTE_COLORS } from "../constants/theme";
import { isClosingMarkerDescription } from "./savings";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS } from "./calculations";
import { invalidateSampleData } from "./sampleData";
import { isCreditCardScheduleValid } from "./creditCards";

export const BACKUP_FORMAT = "personal-hub.backup";
export const BACKUP_VERSION = 1;

const SAFETY_BACKUP_NAME = "personal-hub-safety-backup.json";
// Real backups are well under this; the cap keeps a hostile or mistaken file
// from forcing a huge read plus JSON.parse before validation can reject it.
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

// The expo-file-system `File` type does not surface `write`/`text` in its
// public typings on this SDK, so the access is centralised here.
async function writeTextFile(file: File, contents: string): Promise<void> {
  const target = file as unknown as { write?: (c: string) => void | Promise<void> };
  if (typeof target.write !== "function") throw new Error("File write not supported");
  await target.write(contents);
}

async function readTextFile(file: File): Promise<string> {
  const source = file as unknown as { text?: () => Promise<string> };
  if (typeof source.text !== "function") throw new Error("Cannot read file");
  return source.text();
}

function safetyBackupFile(): File {
  // Document storage, not cache: the OS may purge the cache directory under
  // storage pressure and this file is the only way back from a bad import.
  return new File(Paths.document, SAFETY_BACKUP_NAME);
}

function safetyBackupTempFile(): File {
  return new File(Paths.document, `${SAFETY_BACKUP_NAME}.tmp`);
}

async function createSafetyBackup(): Promise<void> {
  const envelope = await buildBackupEnvelope();
  const temp = safetyBackupTempFile();
  const target = safetyBackupFile();
  // Write to a temporary file first, then move it over the previous snapshot,
  // so a crash mid-write can never truncate or destroy the recovery copy.
  if (temp.exists) {
    try {
      await temp.delete();
    } catch {
      // Overwritten below; a stale temp file is harmless.
    }
  }
  await writeTextFile(temp, JSON.stringify(envelope, null, 2));
  await temp.move(target, { overwrite: true });
}

export async function hasSafetyBackup(): Promise<boolean> {
  try {
    return safetyBackupFile().exists;
  } catch {
    return false;
  }
}

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
    /**
     * Checklist items. Optional: backups written before checklist notes
     * existed omit this, and are restored with no items.
     */
    noteItems?: Record<string, unknown>[];
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
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isSafeInteger(v);
}

function isBinaryFlag(v: unknown): v is 0 | 1 {
  return v === 0 || v === 1;
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
  for (const key of ["cc2_balance", "cc2_apr", "cc2_payment", "cc2_months_paid"]) {
    const value = row[key];
    if (value === undefined) continue; // Legacy backups have only the first card.
    if (!isFiniteNumber(value) || value < 0 ||
        (key === "cc2_months_paid" ? !Number.isSafeInteger(value) || value > MAX_LOAN_TERM_MONTHS : key !== "cc2_apr" && value > MAX_LOAN_AMOUNT)) {
      return `loans.${key} invalid`;
    }
  }
  for (const prefix of ["cc", "cc2"]) {
    const start = row[`${prefix}_start_month`];
    const end = row[`${prefix}_end_month`];
    if ((start != null && typeof start !== "string") || (end != null && typeof end !== "string") ||
        !isCreditCardScheduleValid({ startMonth: typeof start === "string" ? start : null, endMonth: typeof end === "string" ? end : null })) {
      return `loans.${prefix} schedule invalid`;
    }
  }
  if (!optionalString(row, "cc2_name")) return "loans.cc2_name invalid";
  if (row.id !== undefined && row.id !== 1) return "loans.id must be 1";
  for (const key of ["loan_amount", "loan_rate", "loan_payment", "cc_balance", "cc_apr", "cc_payment"]) {
    if (!isFiniteNumber(row[key])) return `loans.${key} invalid`;
    if (row[key] < 0) return `loans.${key} must be non-negative`;
  }
  for (const key of ["loan_term", "loan_payment_day", "loan_months_paid", "cc_months_paid"]) {
    if (!isInteger(row[key])) return `loans.${key} invalid`;
  }
  if (Number(row.loan_term) < 0 || Number(row.loan_months_paid) < 0 || Number(row.cc_months_paid) < 0) {
    return "loans month counts must be non-negative";
  }
  if (Number(row.loan_payment_day) < 1 || Number(row.loan_payment_day) > 31) {
    return "loans.loan_payment_day invalid";
  }
  if (Number(row.loan_term) > MAX_LOAN_TERM_MONTHS || Number(row.loan_months_paid) > MAX_LOAN_TERM_MONTHS ||
      Number(row.cc_months_paid) > MAX_LOAN_TERM_MONTHS || Number(row.loan_rate) > MAX_LOAN_ANNUAL_RATE ||
      Number(row.loan_amount) > MAX_LOAN_AMOUNT || Number(row.loan_payment) > MAX_LOAN_AMOUNT) {
    return "loans values out of range";
  }
  if (row.loan_start_date !== null && row.loan_start_date !== undefined && !isValidDate(row.loan_start_date)) return "loans.loan_start_date invalid";
  if (!optionalString(row, "loan_name") || !optionalString(row, "cc_name")) return "loans names invalid";
  return null;
}

function validateSavingsGoal(row: Record<string, unknown>): string | null {
  if (row.id !== undefined && row.id !== 1) return "savingsGoal.id must be 1";
  if (!isFiniteNumber(row.goal_amount) || !isFiniteNumber(row.salary)) return "savingsGoal numeric fields invalid";
  if (row.goal_amount < 0 || row.salary < 0) return "savingsGoal amounts must be non-negative";
  return null;
}

function validateBudget(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !isValidMonth(row.month) || !isFiniteNumber(row.income)) return "budget fields invalid";
  if (row.income < 0) return "budget.income must be non-negative";
  if (row.loan_paid !== undefined && !isBinaryFlag(row.loan_paid)) return "budget.loan_paid invalid";
  if (row.cc_paid !== undefined && !isBinaryFlag(row.cc_paid)) return "budget.cc_paid invalid";
  if (row.cc2_paid !== undefined && !isBinaryFlag(row.cc2_paid)) return "budget.cc2_paid invalid";
  if (row.loan_counter_incremented !== undefined && row.loan_counter_incremented !== null &&
      !isBinaryFlag(row.loan_counter_incremented)) return "budget.loan_counter_incremented invalid";
  if (!optionalString(row, "updated_at")) return "budget.updated_at invalid";
  return null;
}

function validateExpense(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "category") || !isFiniteNumber(row.amount)) return "expense fields invalid";
  if (row.amount < 0) return "expense.amount must be non-negative";
  if (row.budget_id !== undefined && (!isInteger(row.budget_id) || row.budget_id <= 0)) return "expense.budget_id invalid";
  if (row.budget_month !== undefined && !isValidMonth(row.budget_month)) return "expense.budget_month invalid";
  if (row.budget_id === undefined && row.budget_month === undefined) return "expense has no budget reference";
  for (const key of ["paid", "is_recurring"]) if (row[key] !== undefined && !isBinaryFlag(row[key])) return `expense.${key} invalid`;
  return null;
}

function validateRecurringExpense(row: Record<string, unknown>): string | null {
  return !optionalId(row) || !requiredString(row, "category") || !isFiniteNumber(row.amount) || row.amount < 0 ? "recurring expense fields invalid" : null;
}

function validateAutoDeposit(row: Record<string, unknown>): string | null {
  return !isValidMonth(row.month) || !isFiniteNumber(row.amount) || row.amount < 0 || !optionalString(row, "description") ? "auto deposit fields invalid" : null;
}

function validateTransaction(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || (row.type !== "deposit" && row.type !== "purchase") || !requiredString(row, "description") || !isFiniteNumber(row.amount)) return "transaction fields invalid";
  if (row.amount < 0) return "transaction.amount must be non-negative";
  if (!isValidDate(row.date) && !isValidMonth(row.date)) return "transaction.date invalid";
  return null;
}

function validateDhikr(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "name") || !isInteger(row.total_count) || !isInteger(row.daily_count) || !isInteger(row.sort_order)) return "dhikr fields invalid";
  if (row.daily_limit !== null && !isInteger(row.daily_limit)) return "dhikr.daily_limit invalid";
  if (Number(row.total_count) < 0 || Number(row.daily_count) < 0 || Number(row.sort_order) < 0) return "dhikr counts and sort order must be non-negative";
  if (row.daily_limit !== null && Number(row.daily_limit) < 0) return "dhikr.daily_limit must be non-negative";
  if (!isValidDate(row.last_reset_date) || !requiredString(row, "created_at")) return "dhikr dates invalid";
  return null;
}

function validateNote(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "title") || !requiredString(row, "content") || !optionalString(row, "plain_text")) return "note text fields invalid";
  if (
    !isBinaryFlag(row.is_pinned) ||
    typeof row.color !== "string" ||
    !Object.prototype.hasOwnProperty.call(NOTE_COLORS, row.color)
  ) {
    return "note fields invalid";
  }
  if (row.kind !== undefined && row.kind !== "text" && row.kind !== "checklist") return "note.kind invalid";
  if (!requiredString(row, "created_at") || !requiredString(row, "updated_at")) return "note dates invalid";
  return null;
}

function validateNoteItem(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "text")) return "note item fields invalid";
  if (!isInteger(row.note_id) || (row.note_id as number) <= 0) return "note item note_id invalid";
  if (!isBinaryFlag(row.checked)) return "note item checked invalid";
  if (!isInteger(row.position) || (row.position as number) < 0) return "note item position invalid";
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
  const budgetMonthById = new Map<number, string>();
  for (const budget of budgets) {
    budgetMonths.add(budget.month as string);
    if (budget.id !== undefined) {
      const id = budget.id as number;
      if (budgetIds.has(id)) return { ok: false, error: "Duplicate budget ID" };
      budgetIds.add(id);
      budgetMonthById.set(id, budget.month as string);
    }
  }
  if (budgetMonths.size !== budgets.length) return { ok: false, error: "Duplicate budget month" };
  for (const expense of tables.expenses as Record<string, unknown>[]) {
    const hasMonth = expense.budget_month !== undefined && budgetMonths.has(expense.budget_month as string);
    const hasId = expense.budget_id !== undefined && budgetIds.has(expense.budget_id as number);
    if (!hasMonth && !hasId) return { ok: false, error: "Expense references a missing budget" };
    if (expense.budget_month !== undefined && expense.budget_id !== undefined &&
      budgetMonthById.get(expense.budget_id as number) !== expense.budget_month) {
      return { ok: false, error: "Expense budget references disagree" };
    }
  }
  const autoDepositMonths = (tables.autoDeposits as Record<string, unknown>[]).map((row) => row.month as string);
  if (new Set(autoDepositMonths).size !== autoDepositMonths.length) return { ok: false, error: "Duplicate auto deposit month" };

  // Optional checklist items (absent in backups written before v5).
  const noteItems = tables.noteItems;
  if (noteItems !== undefined) {
    if (!Array.isArray(noteItems)) return { ok: false, error: "tables.noteItems must be array" };
    const noteIds = new Set<number>();
    for (const note of tables.notes as Record<string, unknown>[]) {
      if (note.id !== undefined) noteIds.add(note.id as number);
    }
    for (const [index, value] of noteItems.entries()) {
      if (!isObject(value)) return { ok: false, error: `tables.noteItems[${index}] must be object` };
      const error = validateNoteItem(value);
      if (error) return { ok: false, error: `tables.noteItems[${index}]: ${error}` };
      if (!noteIds.has(value.note_id as number)) return { ok: false, error: "note item references a missing note" };
    }
  }
  const notesWithIds = (tables.notes as Record<string, unknown>[]).filter((note) => note.id !== undefined);
  if (new Set(notesWithIds.map((note) => note.id as number)).size !== notesWithIds.length) {
    return { ok: false, error: "Duplicate note ID" };
  }

  // Detect accidental .db file pick: JSON parse would have thrown already, but guard SQLite header if base64
  // Real SQLite header check is done on file read before JSON parse (see import flow).

  return { ok: true, data: raw as unknown as BackupEnvelope };
}

export async function buildBackupEnvelope(): Promise<BackupEnvelope> {
  return db.withTransaction(async (tx) => {
    const [loansRow, savingsGoalRow, budgets, expenses, recurringExpenses, autoDeposits, transactions, dhikrs, notes, noteItems] =
      await Promise.all([
        tx.get<Record<string, unknown>>("SELECT * FROM loans WHERE id = 1"),
        tx.get<Record<string, unknown>>("SELECT * FROM savings_goals WHERE id = 1"),
        tx.query<Record<string, unknown>>("SELECT * FROM budgets ORDER BY month"),
        tx.query<Record<string, unknown>>("SELECT * FROM expenses ORDER BY id"),
        tx.query<Record<string, unknown>>("SELECT * FROM recurring_expenses ORDER BY id"),
        tx.query<Record<string, unknown>>("SELECT * FROM savings_auto_deposits ORDER BY month"),
        tx.query<Record<string, unknown>>("SELECT * FROM savings_transactions ORDER BY id"),
        tx.query<Record<string, unknown>>("SELECT * FROM dhikrs ORDER BY sort_order, id"),
        tx.query<Record<string, unknown>>("SELECT * FROM notes ORDER BY id"),
        tx.query<Record<string, unknown>>("SELECT * FROM note_items ORDER BY note_id, position, id"),
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
        noteItems,
      },
    };
  });
}

export async function exportBackupToFile(): Promise<string> {
  const envelope = await buildBackupEnvelope();
  const json = JSON.stringify(envelope, null, 2);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `personal-hub-backup-${ts}.json`;
  const file = new File(Paths.cache, name);
  await writeTextFile(file, json);
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

let importInProgress = false;

export async function importBackupFromJson(jsonStr: string): Promise<void> {
  if (importInProgress) {
    throw new Error("An import is already in progress");
  }
  importInProgress = true;
  try {
    await performImport(jsonStr, { skipSafetyBackup: false });
  } finally {
    importInProgress = false;
  }
}

/**
 * Restore the snapshot written automatically before the last import. Used to
 * recover if an import corrupted or emptied the database.
 */
export async function restoreSafetyBackup(): Promise<void> {
  if (importInProgress) {
    throw new Error("An import is already in progress");
  }
  // Claim the mutex immediately: reading the file happens after, so two
  // simultaneous restores must not both pass the guard above.
  importInProgress = true;
  try {
    const file = safetyBackupFile();
    if (!file.exists) throw new Error("No safety backup available");
    const jsonStr = await readTextFile(file);
    await performImport(jsonStr, { skipSafetyBackup: true });
  } finally {
    importInProgress = false;
  }
}

interface ImportOptions {
  skipSafetyBackup: boolean;
}

async function performImport(jsonStr: string, options: ImportOptions): Promise<void> {
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
  if (!options.skipSafetyBackup) {
    try {
      await createSafetyBackup();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Safety backup failed: ${reason}`);
    }
  }

  // SecureStore ownership IDs/months belong to the previous database. Clear
  // them before replacement, even for a safety restore. If this fails, abort
  // without touching user data rather than risking later demo cleanup.
  await invalidateSampleData();

  try {
    await db.withTransaction(async (tx) => {
    // Clear in FK-safe order
    await tx.execute("DELETE FROM expenses");
    await tx.execute("DELETE FROM budgets");
    await tx.execute("DELETE FROM recurring_expenses");
    await tx.execute("DELETE FROM savings_auto_deposits");
    await tx.execute("DELETE FROM savings_transactions");
    await tx.execute("DELETE FROM dhikrs");
    await tx.execute("DELETE FROM note_items");
    await tx.execute("DELETE FROM notes");
    await tx.execute("DELETE FROM loans");
    await tx.execute("DELETE FROM savings_goals");

    // Restore singletons
    if (env.tables.loans) {
      const r = env.tables.loans as Record<string, unknown>;
      await tx.execute(
        `INSERT INTO loans (id, loan_amount, loan_rate, loan_term, loan_payment, loan_start_date, loan_payment_day, loan_months_paid, loan_name, cc_balance, cc_apr, cc_payment, cc_months_paid, cc_name, cc_start_month, cc_end_month, cc2_balance, cc2_apr, cc2_payment, cc2_months_paid, cc2_name, cc2_start_month, cc2_end_month) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.loan_amount as number,
          r.loan_rate as number,
          r.loan_term as number,
          r.loan_payment as number,
          (r.loan_start_date as string | null) ?? null,
          r.loan_payment_day as number,
          r.loan_months_paid as number,
          String(r.loan_name ?? ""),
          r.cc_balance as number,
          r.cc_apr as number,
          r.cc_payment as number,
          r.cc_months_paid as number,
          String(r.cc_name ?? ""),
          typeof r.cc_start_month === "string" ? r.cc_start_month : null,
          typeof r.cc_end_month === "string" ? r.cc_end_month : null,
          typeof r.cc2_balance === "number" ? r.cc2_balance : 0,
          typeof r.cc2_apr === "number" ? r.cc2_apr : 0,
          typeof r.cc2_payment === "number" ? r.cc2_payment : 0,
          typeof r.cc2_months_paid === "number" ? r.cc2_months_paid : 0,
          String(r.cc2_name ?? ""),
          typeof r.cc2_start_month === "string" ? r.cc2_start_month : null,
          typeof r.cc2_end_month === "string" ? r.cc2_end_month : null,
        ]
      );
    }

    if (env.tables.savingsGoal) {
      const r = env.tables.savingsGoal as Record<string, unknown>;
      await tx.execute(`INSERT INTO savings_goals (id, goal_amount, salary) VALUES (1, ?, ?)`, [
        r.goal_amount as number,
        r.salary as number,
      ]);
    }

    // Restore budgets and build month->id map for expenses
    const monthToId = new Map<string, number>();
    for (const b of env.tables.budgets) {
      const row = b as Record<string, unknown>;
      const month = row.month as string;
      const res = await tx.execute(
        `INSERT INTO budgets (month, income, loan_paid, cc_paid, cc2_paid, loan_counter_incremented, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          month,
          row.income as number,
          row.loan_paid ? 1 : 0,
          row.cc_paid ? 1 : 0,
          row.cc2_paid ? 1 : 0,
          row.loan_counter_incremented ?? null,
          (row.updated_at as string) || new Date().toISOString(),
        ]
      );
      // get inserted id via lastId or lookup
      let newId = res.lastId;
      if (!newId) {
        const found = await tx.get<Record<string, unknown>>("SELECT id FROM budgets WHERE month = ?", [month]);
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
      await tx.execute(
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
      await tx.execute(`INSERT INTO recurring_expenses (category, amount) VALUES (?, ?)`, [
        String(row.category ?? ""),
        row.amount as number,
      ]);
    }

    for (const r of env.tables.autoDeposits) {
      const row = r as Record<string, unknown>;
      const month = row.month as string;
      await tx.execute(`INSERT INTO savings_auto_deposits (month, amount, description) VALUES (?, ?, ?)`, [
        month,
        row.amount as number,
        String(row.description ?? ""),
      ]);
    }

    for (const r of env.tables.transactions) {
      const row = r as Record<string, unknown>;
      const t = row.type as "deposit" | "purchase";
      const date = row.date as string;
      // Derive the closing flag from the description rather than trusting the
      // exported column, so backups written before v4 restore correctly.
      const description = row.description as string;
      const isClosing = isClosingMarkerDescription(description) ? 1 : 0;
      await tx.execute(
        `INSERT INTO savings_transactions (type, description, amount, date, is_closing) VALUES (?, ?, ?, ?, ?)`,
        [t, description, row.amount as number, date, isClosing]
      );
    }

    for (const r of env.tables.dhikrs) {
      const row = r as Record<string, unknown>;
      await tx.execute(
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

    // Map old note ids to the freshly assigned ids so checklist items can be
    // re-linked. Items whose note id is unknown are dropped rather than
    // orphaned (validation already rejects unknown references).
    const noteIdMap = new Map<number, number>();
    for (const r of env.tables.notes) {
      const row = r as Record<string, unknown>;
      const kind = row.kind === "checklist" ? "checklist" : "text";
      const res = await tx.execute(
        `INSERT INTO notes (title, content, kind, is_pinned, color, plain_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.title as string,
          row.content as string,
          kind,
          row.is_pinned ? 1 : 0,
          row.color as string,
          (row.plain_text as string | undefined) ?? "",
          row.created_at as string,
          row.updated_at as string,
        ]
      );
      if (row.id !== undefined && res.lastId) {
        noteIdMap.set(row.id as number, res.lastId);
      }
    }

    for (const r of env.tables.noteItems ?? []) {
      const row = r as Record<string, unknown>;
      const noteId = noteIdMap.get(row.note_id as number);
      if (!noteId) continue;
      await tx.execute(
        `INSERT INTO note_items (note_id, text, checked, position) VALUES (?, ?, ?, ?)`,
        [noteId, String(row.text ?? ""), row.checked ? 1 : 0, Number(row.position) || 0]
      );
    }
    });
    // Keep the snapshot after a successful import: a schema-valid file can
    // still be the wrong file, and this is the only in-app way back. It is
    // replaced atomically when the next import starts.
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Restore failed: ${reason}`);
  }
}

export async function readJsonFromFileUri(uri: string): Promise<string> {
  const file = new File(uri);
  if (!file.exists) throw new Error("File not found");
  const size = file.size;
  if (size !== null && size > MAX_IMPORT_BYTES) {
    throw new Error("Backup file is too large");
  }
  const content = await readTextFile(file);
  if (content.startsWith("SQLite format 3")) throw new Error("Invalid backup: SQLite file");
  return content;
}
