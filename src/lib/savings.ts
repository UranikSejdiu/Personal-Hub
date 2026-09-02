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
  // Find the most recent carry-forward (closing balance) transaction so we
  // don't double-count data from already-closed years.
  const closingTxs = await db.query<Record<string, unknown>>(
    `SELECT id, amount, type, date FROM savings_transactions
     WHERE description LIKE '%Bilanci mbyllës%' OR description LIKE '%Closing balance%'
     ORDER BY date DESC, id DESC`
  );

  let carryForwardNet = 0;
  let latestClosingDate: string | null = null;
  if (closingTxs.length > 0) {
    const latest = closingTxs[0];
    const net =
      Number(latest.amount) * (latest.type === "deposit" ? 1 : -1);
    carryForwardNet = net;
    latestClosingDate = String(latest.date);
  }

  if (latestClosingDate) {
    // Only count auto-deposits and transactions AFTER the latest closing date.
    const [autoRow, txRow] = await Promise.all([
      db.get<Record<string, unknown>>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month > ?",
        [latestClosingDate.slice(0, 7)]
      ),
      db.get<Record<string, unknown>>(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS saved,
           COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) AS spent
         FROM savings_transactions WHERE date > ?`,
        [latestClosingDate]
      ),
    ]);
    const totalSaved =
      carryForwardNet +
      (Number(autoRow?.total) || 0) +
      (Number(txRow?.saved) || 0);
    const totalSpent = Number(txRow?.spent) || 0;
    return {
      balance: totalSaved - totalSpent,
      totalSaved,
      totalSpent,
    };
  }

  // No closing transaction yet — sum everything from the beginning.
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

export async function closeYear(
  year: number,
  closingDescription: string
): Promise<{ net: number; created: SavingsTransaction | null }> {
  const nextYear = year + 1;
  const carryForwardDate = `${nextYear}-01-01`;

  // Guard: prevent running closeYear twice for the same year — if a carry-forward
  // transaction with this exact description already exists, bail out early.
  const existing = await db.get<Record<string, unknown>>(
    "SELECT id FROM savings_transactions WHERE date = ? AND description = ? LIMIT 1",
    [carryForwardDate, closingDescription]
  );
  if (existing) return { net: 0, created: null };

  const prefix = `${year}-`;
  const like = `${prefix}%`;
  const [autoRow, txRow] = await Promise.all([
    db.get<Record<string, unknown>>(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month LIKE ?",
      [like]
    ),
    db.get<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS saved,
         COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) AS spent
       FROM savings_transactions WHERE date LIKE ?`,
      [like]
    ),
  ]);
  const autoTotal = Number(autoRow?.total) || 0;
  const saved = Number(txRow?.saved) || 0;
  const spent = Number(txRow?.spent) || 0;
  const net = autoTotal + saved - spent;
  if (net === 0) return { net: 0, created: null };
  const type: SavingsEntryType = net > 0 ? "deposit" : "purchase";
  const amount = Math.abs(net);
  const created = await addTransaction(type, closingDescription, amount, carryForwardDate);
  return { net, created };
}
