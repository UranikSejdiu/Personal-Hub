import * as db from "./db";
import { currentMonth } from "./budget";

export type SavingsEntryType = "deposit" | "purchase";

export interface AutoDeposit {
  month: string;
  amount: number;
}

export interface SavingsTransaction {
  id: number;
  type: SavingsEntryType;
  description: string;
  amount: number;
  date: string;
}

export interface SavingsSummary {
  balance: number;
  totalSaved: number;
  totalSpent: number;
}

function sanitizeAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Auto deposits (monthly snapshot of the savings goal)
// ---------------------------------------------------------------------------

export async function ensureMonthlyAutoDeposit(
  goalAmount: number
): Promise<void> {
  const amount = sanitizeAmount(goalAmount);
  if (amount === 0) return;
  await db.execute(
    `INSERT OR IGNORE INTO savings_auto_deposits (month, amount)
     VALUES (?, ?)`,
    [currentMonth(), amount]
  );
}

export async function listAutoDeposits(): Promise<AutoDeposit[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM savings_auto_deposits ORDER BY month DESC"
  );
  return rows.map((row) => ({
    month: String(row.month),
    amount: Number(row.amount) || 0,
  }));
}

export async function setAutoDepositAmount(
  month: string,
  amount: number
): Promise<void> {
  await db.execute(
    "UPDATE savings_auto_deposits SET amount = ? WHERE month = ?",
    [sanitizeAmount(amount), month]
  );
}

export async function deleteAutoDeposit(month: string): Promise<void> {
  await db.execute(
    "DELETE FROM savings_auto_deposits WHERE month = ?",
    [month]
  );
}

// ---------------------------------------------------------------------------
// Manual transactions
// ---------------------------------------------------------------------------

function toTransaction(row: Record<string, unknown>): SavingsTransaction {
  const rawType = String(row.type);
  return {
    id: Number(row.id),
    type: rawType === "deposit" ? "deposit" : "purchase",
    description: String(row.description),
    amount: Number(row.amount) || 0,
    date: String(row.date),
  };
}

export async function listTransactions(): Promise<SavingsTransaction[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM savings_transactions ORDER BY date DESC, id DESC"
  );
  return rows.map(toTransaction);
}

export async function addTransaction(
  type: SavingsEntryType,
  description: string,
  amount: number,
  date: string
): Promise<SavingsTransaction> {
  const sanitized = sanitizeAmount(amount);
  const trimmed = description.trim();
  const result = await db.execute(
    "INSERT INTO savings_transactions (type, description, amount, date) VALUES (?, ?, ?, ?)",
    [type, trimmed, sanitized, date]
  );
  if (!result.lastId) throw new Error("Failed to add savings entry.");
  return {
    id: result.lastId,
    type,
    description: trimmed,
    amount: sanitized,
    date,
  };
}

export interface TransactionUpdate {
  type?: SavingsEntryType;
  description?: string;
  amount?: number;
  date?: string;
}

export async function updateTransaction(
  id: number,
  fields: TransactionUpdate
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (fields.type !== undefined) {
    sets.push("type = ?");
    values.push(fields.type);
  }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    values.push(fields.description.trim());
  }
  if (fields.amount !== undefined) {
    sets.push("amount = ?");
    values.push(sanitizeAmount(fields.amount));
  }
  if (fields.date !== undefined) {
    sets.push("date = ?");
    values.push(fields.date);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE savings_transactions SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.execute("DELETE FROM savings_transactions WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getSavingsSummary(): Promise<SavingsSummary> {
  const [autoRow, txRow] = await Promise.all([
    db.get<Record<string, unknown>>(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits"
    ),
    db.get<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS saved,
         COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) AS spent
       FROM savings_transactions`
    ),
  ]);
  const totalSaved =
    (Number(autoRow?.total) || 0) + (Number(txRow?.saved) || 0);
  const totalSpent = Number(txRow?.spent) || 0;
  return {
    balance: totalSaved - totalSpent,
    totalSaved,
    totalSpent,
  };
}
