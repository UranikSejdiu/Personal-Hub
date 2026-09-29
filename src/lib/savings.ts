import * as db from "./db";
import { currentMonth } from "./budget";

export type SavingsEntryType = "deposit" | "purchase";

const CLOSING_MARKER = "[system:closing]";

export interface AutoDeposit {
  month: string;
  amount: number;
  description: string;
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
  goalAmount: number,
  description?: string
): Promise<void> {
  const amount = sanitizeAmount(goalAmount);
  if (amount === 0) return;
  const desc = description?.trim() ?? "";
  await db.execute(
    `INSERT OR IGNORE INTO savings_auto_deposits (month, amount, description)
     VALUES (?, ?, ?)`,
    [currentMonth(), amount, desc]
  );
}

export async function listAutoDeposits(): Promise<AutoDeposit[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM savings_auto_deposits ORDER BY month DESC"
  );
  return rows.map((row) => ({
    month: String(row.month),
    amount: Number(row.amount) || 0,
    description: String(row.description ?? ""),
  }));
}

export async function deleteAutoDeposit(month: string): Promise<void> {
  await db.execute(
    "DELETE FROM savings_auto_deposits WHERE month = ?",
    [month]
  );
}

export interface AutoDepositUpdate {
  description?: string;
  amount?: number;
}

export async function updateAutoDeposit(
  month: string,
  fields: AutoDepositUpdate
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (fields.description !== undefined) {
    sets.push("description = ?");
    values.push(fields.description.trim());
  }
  if (fields.amount !== undefined) {
    sets.push("amount = ?");
    values.push(sanitizeAmount(fields.amount));
  }
  if (sets.length === 0) return;
  values.push(month);
  await db.execute(
    `UPDATE savings_auto_deposits SET ${sets.join(", ")} WHERE month = ?`,
    values
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
    description: String(row.description).replace(`${CLOSING_MARKER} `, ""),
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

/** Descriptions reserved for system carry-forward rows. */
export function isClosingMarkerDescription(description: string): boolean {
  const d = description.trim();
  return (
    d.startsWith(CLOSING_MARKER) ||
    d.startsWith("Bilanci mbyllës") ||
    d.startsWith("Closing balance")
  );
}

async function insertTransaction(
  type: SavingsEntryType,
  description: string,
  amount: number,
  date: string,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<SavingsTransaction> {
  const sanitized = sanitizeAmount(amount);
  const trimmed = description.trim();
  const result = await exec.execute(
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

export async function addTransaction(
  type: SavingsEntryType,
  description: string,
  amount: number,
  date: string
): Promise<SavingsTransaction> {
  // Guard the system carry-forward namespace so a user entry can never be
  // mistaken for a closing marker by the summary/close logic.
  if (isClosingMarkerDescription(description)) {
    throw new Error("Reserved savings description");
  }
  return insertTransaction(type, description, amount, date);
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
    if (isClosingMarkerDescription(fields.description)) {
      throw new Error("Reserved savings description");
    }
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
      WHERE description LIKE ? OR description LIKE '%Bilanci mbyllës%' OR description LIKE '%Closing balance%'
      ORDER BY date DESC, id DESC LIMIT 1`,
    [`${CLOSING_MARKER}%`]
  );

  let carryForwardNet = 0;
  let latestClosingId: number | null = null;
  let latestClosingDate: string | null = null;
  if (closingTxs.length > 0) {
    const latest = closingTxs[0];
    const net =
      Number(latest.amount) * (latest.type === "deposit" ? 1 : -1);
    carryForwardNet = net;
    latestClosingId = Number(latest.id);
    latestClosingDate = String(latest.date);
  }

  if (latestClosingDate && latestClosingId !== null) {
    // Only count auto-deposits and transactions AFTER the latest closing date.
    // `>=` keeps legitimate entries made on the carry-forward date (Jan 1),
    // while `id != markerId` excludes the marker row itself from the sum.
    const [autoRow, txRow] = await Promise.all([
      db.get<Record<string, unknown>>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month >= ?",
        [latestClosingDate.slice(0, 7)]
      ),
      db.get<Record<string, unknown>>(
        `SELECT
           COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END), 0) AS saved,
           COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE 0 END), 0) AS spent
         FROM savings_transactions WHERE date >= ? AND id != ?`,
        [latestClosingDate, latestClosingId]
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

export interface CloseYearResult {
  net: number;
  created: SavingsTransaction | null;
  /**
   * When set, the requested year was rejected because this earlier year still
   * has activity that has not been closed yet. Only the earliest open year may
   * be closed so carry-forward ordering (and the summary's single newest
   * marker) stay correct.
   */
  blockedYear?: number;
}

export async function closeYear(
  year: number,
  closingDescription: string
): Promise<CloseYearResult> {
  return db.withTransaction(async (tx) => {
    const nextYear = year + 1;
    const carryForwardDate = `${nextYear}-01-01`;

    // Keep the existence check, totals, and carry-forward insert atomic so
    // repeated/concurrent requests cannot close the same year twice.
    const existing = await tx.get<Record<string, unknown>>(
      "SELECT id FROM savings_transactions WHERE date = ? AND (description LIKE ? OR description = ? OR description = ? OR description = ?) LIMIT 1",
      [carryForwardDate, `${CLOSING_MARKER}%`, closingDescription, "Bilanci mbyllës", "Closing balance"]
    );
    if (existing) return { net: 0, created: null };

    // Reject out-of-order closes: find every year with real activity, then the
    // earliest one that has no carry-forward marker dated Jan 1 of the next year.
    const [activityRows, markerRows] = await Promise.all([
      tx.query<Record<string, unknown>>(
        `SELECT substr(month, 1, 4) AS year FROM savings_auto_deposits
         UNION
         SELECT substr(date, 1, 4) AS year FROM savings_transactions
          WHERE description NOT LIKE ? AND description NOT LIKE '%Bilanci mbyllës%' AND description NOT LIKE '%Closing balance%'`
      ),
      tx.query<Record<string, unknown>>(
        `SELECT substr(date, 1, 4) AS year FROM savings_transactions
          WHERE description LIKE ? OR description LIKE '%Bilanci mbyllës%' OR description LIKE '%Closing balance%'`,
        [`${CLOSING_MARKER}%`]
      ),
    ]);
    const closedYears = new Set(
      markerRows.map((r) => Number(String(r.year).slice(0, 4)) - 1)
    );
    const earliestUnclosed = activityRows
      .map((r) => Number(String(r.year).slice(0, 4)))
      .filter((y) => Number.isInteger(y) && !closedYears.has(y))
      .sort((a, b) => a - b)[0];
    if (earliestUnclosed !== undefined && earliestUnclosed < year) {
      return { net: 0, created: null, blockedYear: earliestUnclosed };
    }

    // Nothing recorded for this year (a carry-forward marker on its own is not
    // activity) — there is nothing to close.
    const yearHasActivity = activityRows.some(
      (r) => Number(String(r.year).slice(0, 4)) === year
    );
    if (!yearHasActivity) return { net: 0, created: null };

    const like = `${year}-%`;
    const [autoRow, txRow] = await Promise.all([
      tx.get<Record<string, unknown>>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month LIKE ?",
        [like]
      ),
      tx.get<Record<string, unknown>>(
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
    // A zero net still needs a carry-forward marker: without one the year
    // would stay "open" and block every later year from being closed.
    const type: SavingsEntryType = net >= 0 ? "deposit" : "purchase";
    const amount = Math.abs(net);
    const created = await insertTransaction(
      type,
      `${CLOSING_MARKER} ${closingDescription}`,
      amount,
      carryForwardDate,
      tx
    );
    return { net, created };
  });
}
