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
  await db.withTransaction(async (tx) => {
    await tx.execute(
      `INSERT OR IGNORE INTO savings_auto_deposits (month, amount, description)
       VALUES (?, ?, ?)`,
      [currentMonth(), amount, desc]
    );
    await refreshClosingBalances(tx);
  });
}

/** Settings changes replace only this month's target snapshot; history stays intact. */
export async function syncMonthlyAutoDeposit(goalAmount: number, tx: db.DbExecutor): Promise<void> {
  const amount = sanitizeAmount(goalAmount);
  if (amount === 0) {
    await tx.execute("UPDATE savings_auto_deposits SET amount = 0 WHERE month = ?", [currentMonth()]);
  } else {
    await tx.execute(
      `INSERT INTO savings_auto_deposits (month, amount, description) VALUES (?, ?, '')
       ON CONFLICT(month) DO UPDATE SET amount = excluded.amount`,
      [currentMonth(), amount]
    );
  }
  await refreshClosingBalances(tx);
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
  await db.withTransaction(async (tx) => {
    await tx.execute("DELETE FROM savings_auto_deposits WHERE month = ?", [month]);
    await refreshClosingBalances(tx);
  });
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
  await db.withTransaction(async (tx) => {
    await tx.execute(`UPDATE savings_auto_deposits SET ${sets.join(", ")} WHERE month = ?`, values);
    await refreshClosingBalances(tx);
  });
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
  const isClosing = isClosingMarkerDescription(trimmed) ? 1 : 0;
  const result = await exec.execute(
    "INSERT INTO savings_transactions (type, description, amount, date, is_closing) VALUES (?, ?, ?, ?, ?)",
    [type, trimmed, sanitized, date, isClosing]
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
  return db.withTransaction(async (tx) => {
    const created = await insertTransaction(type, description, amount, date, tx);
    await refreshClosingBalances(tx);
    return created;
  });
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
  await db.withTransaction(async (tx) => {
    const existing = await tx.get<{ is_closing: number }>(
      "SELECT is_closing FROM savings_transactions WHERE id = ?", [id]
    );
    if (existing?.is_closing === 1) throw new Error("Cannot edit a closing balance");
    await tx.execute(`UPDATE savings_transactions SET ${sets.join(", ")} WHERE id = ?`, values);
    await refreshClosingBalances(tx);
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  await db.withTransaction(async (tx) => {
    const existing = await tx.get<{ is_closing: number }>(
      "SELECT is_closing FROM savings_transactions WHERE id = ?", [id]
    );
    if (existing?.is_closing === 1) throw new Error("Cannot delete a closing balance");
    await tx.execute("DELETE FROM savings_transactions WHERE id = ?", [id]);
    await refreshClosingBalances(tx);
  });
}

/** Rebuild every marker from source activity, so edits in closed years remain visible. */
async function refreshClosingBalances(tx: db.DbExecutor): Promise<void> {
  const markers = await tx.query<{ id: number; date: string }>(
    "SELECT id, date FROM savings_transactions WHERE is_closing = 1 ORDER BY date, id"
  );
  for (const marker of markers) {
    const net = await closingNetBefore(tx, marker.date);
    await tx.execute(
      "UPDATE savings_transactions SET type = ?, amount = ? WHERE id = ?",
      [net >= 0 ? "deposit" : "purchase", Math.abs(net), marker.id]
    );
  }
}

async function closingNetBefore(tx: db.DbExecutor, date: string): Promise<number> {
  const auto = await tx.get<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month < ?",
    [date.slice(0, 7)]
  );
  const manual = await tx.get<{ total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0) AS total
     FROM savings_transactions WHERE is_closing = 0 AND date < ?`,
    [date]
  );
  return Number(auto?.total ?? 0) + Number(manual?.total ?? 0);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getSavingsSummary(): Promise<SavingsSummary> {
  // Find the most recent carry-forward (closing balance) transaction so we
  // don't double-count data from already-closed years.
  const closingTxs = await db.query<Record<string, unknown>>(
    `SELECT id, amount, type, date FROM savings_transactions
      WHERE is_closing = 1
      ORDER BY date DESC, id DESC LIMIT 1`
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

export async function previewClosingBalance(year: number): Promise<number> {
  return db.withTransaction((tx) => closingNetBefore(tx, `${year + 1}-01-01`));
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
      "SELECT id FROM savings_transactions WHERE date = ? AND is_closing = 1 LIMIT 1",
      [carryForwardDate]
    );
    if (existing) return { net: 0, created: null };

    // Reject out-of-order closes: find every year with real activity, then the
    // earliest one that has no carry-forward marker dated Jan 1 of the next year.
    const [activityRows, markerRows] = await Promise.all([
      tx.query<Record<string, unknown>>(
        `SELECT substr(month, 1, 4) AS year FROM savings_auto_deposits
         UNION
         SELECT substr(date, 1, 4) AS year FROM savings_transactions
          WHERE is_closing = 0`
      ),
      tx.query<Record<string, unknown>>(
        `SELECT substr(date, 1, 4) AS year FROM savings_transactions
          WHERE is_closing = 1`
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

    const net = await closingNetBefore(tx, carryForwardDate);
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
