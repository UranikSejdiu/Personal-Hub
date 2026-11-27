import type { DbExecutor } from "./db";

type ClosingMarker = { id: number; date: string };

async function rebuild(tx: DbExecutor, markers: ClosingMarker[]): Promise<void> {
  for (const marker of markers) {
    const net = await closingNetBefore(tx, marker.date);
    await tx.execute(
      "UPDATE savings_transactions SET type = ?, amount = ? WHERE id = ?",
      [net >= 0 ? "deposit" : "purchase", Math.abs(net), marker.id]
    );
  }
}

export async function refreshClosingBalances(tx: DbExecutor, changedDate: string): Promise<void> {
  const day = changedDate.length === 7 ? changedDate + "-01" : changedDate;
  const markers = await tx.query<ClosingMarker>(
    "SELECT id, date FROM savings_transactions WHERE is_closing = 1 AND date > ? ORDER BY date, id", [day]
  );
  await rebuild(tx, markers);
}

// Older versions compared YYYY-MM to YYYY-MM-01 as text, counting January
// entries from legacy backups in the preceding year's closing balance.
export async function repairLegacyJanuaryClosings(tx: DbExecutor): Promise<void> {
  const markers = await tx.query<ClosingMarker>(`
    SELECT m.id, m.date FROM savings_transactions m
    WHERE m.is_closing = 1 AND substr(m.date, 6) = '01-01'
      AND EXISTS (SELECT 1 FROM savings_transactions t
                  WHERE t.is_closing = 0 AND t.date = substr(m.date, 1, 7))`);
  await rebuild(tx, markers);
}

export async function closingNetBefore(tx: DbExecutor, date: string): Promise<number> {
  const auto = await tx.get<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM savings_auto_deposits WHERE month < ?",
    [date.slice(0, 7)]
  );
  const manual = await tx.get<{ total: number }>(
    `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0) AS total
     FROM savings_transactions WHERE is_closing = 0 AND date < ?`,
    [date.endsWith("-01") ? date.slice(0, 7) : date]
  );
  return Number(auto?.total ?? 0) + Number(manual?.total ?? 0);
}
