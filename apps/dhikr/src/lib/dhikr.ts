import * as db from "./db";
import { withTransaction } from "./db";
import { type Dhikr } from "../types/dhikr";

export type { Dhikr };

// Counter taps render immediately and persist in order. Backups drain this
// queue before taking a snapshot or replacing records, including after blur.
let pendingWrites: Promise<void> = Promise.resolve();

export function queueDhikrWrite(task: () => Promise<void>): Promise<void> {
  const result = pendingWrites.then(task);
  pendingWrites = result.then(() => {}, () => {});
  return result;
}

export async function flushDhikrWrites(): Promise<void> {
  await pendingWrites;
}

function toDhikr(row: Record<string, unknown>): Dhikr {
  return {
    id: Number(row.id),
    name: String(row.name),
    total_count: Number(row.total_count) || 0,
    daily_count: Number(row.daily_count) || 0,
    daily_limit:
      row.daily_limit === null || row.daily_limit === undefined
        ? null
        : Number(row.daily_limit),
    last_reset_date: String(row.last_reset_date),
    sort_order: Number(row.sort_order) || 0,
    created_at: String(row.created_at),
  };
}

export function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export async function loadDhikrs(): Promise<Dhikr[]> {
  const today = todayDate();
  let rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM dhikrs ORDER BY sort_order ASC, created_at DESC"
  );
  // Most reads need no write at all. Only perform rollover when a stored
  // nonzero daily count belongs to an earlier day.
  if (!rows.some(row => String(row.last_reset_date) < today && Number(row.daily_count) > 0)) {
    return rows.map(toDhikr);
  }
  // Best-effort day rollover: a failed reset must never fail the read. Rows are
  // also reset lazily inside incrementDhikr on the next tap, so a missed reset
  // here only affects the stale daily_count display, not data.
  try {
    await db.execute(
      "UPDATE dhikrs SET daily_count = 0, last_reset_date = ? WHERE last_reset_date < ? AND daily_count > 0",
      [today, today]
    );
    rows = await db.query<Record<string, unknown>>(
      "SELECT * FROM dhikrs ORDER BY sort_order ASC, created_at DESC"
    );
  } catch (error) {
    console.warn("[dhikr] failed to roll over daily counts", error);
  }
  return rows.map(toDhikr);
}

export async function addDhikr(
  name: string,
  dailyLimit: number | null
): Promise<Dhikr> {
  const today = todayDate();
  const result = await db.execute(
    `INSERT INTO dhikrs (name, daily_limit, last_reset_date, sort_order)
     VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM dhikrs), -1) + 1)`,
    [name, dailyLimit, today]
  );
  const created = await db.get<Record<string, unknown>>(
    "SELECT * FROM dhikrs WHERE id = ?",
    [result.lastId]
  );
  if (!created) throw new Error("Failed to add dhikr.");
  return toDhikr(created);
}

export async function updateDhikr(
  id: number,
  fields: Partial<Pick<Dhikr, "name" | "daily_limit" | "total_count">>
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (fields.name !== undefined) {
    sets.push("name = ?");
    values.push(fields.name);
  }
  if (fields.daily_limit !== undefined) {
    sets.push("daily_limit = ?");
    values.push(fields.daily_limit);
  }
  if (fields.total_count !== undefined) {
    if (!Number.isSafeInteger(fields.total_count) || fields.total_count < 0) {
      throw new RangeError("Total count must be a non-negative safe integer.");
    }
    sets.push("total_count = ?");
    values.push(fields.total_count);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE dhikrs SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteDhikr(id: number): Promise<void> {
  await db.execute("DELETE FROM dhikrs WHERE id = ?", [id]);
}

export async function incrementDhikr(id: number, today = todayDate()): Promise<boolean> {
  const result = await db.execute(
    `UPDATE dhikrs SET
       total_count = total_count + 1,
       daily_count = CASE WHEN last_reset_date < ? THEN 1 ELSE daily_count + 1 END,
       last_reset_date = ?
     WHERE id = ?
       AND total_count < ?
       AND (last_reset_date < ? OR daily_count < ?)
       AND (daily_limit IS NULL OR daily_limit <= 0 OR CASE WHEN last_reset_date < ? THEN 0 ELSE daily_count END < daily_limit)`,
    [today, today, id, Number.MAX_SAFE_INTEGER, today, Number.MAX_SAFE_INTEGER, today]
  );
  return result.changes > 0;
}

export async function resetDhikr(id: number): Promise<void> {
  await db.execute(
    "UPDATE dhikrs SET total_count = 0, daily_count = 0, last_reset_date = ? WHERE id = ?",
    [todayDate(), id]
  );
}

export async function reorderDhikrs(order: number[]): Promise<void> {
  await withTransaction(async (tx) => {
    for (let i = 0; i < order.length; i++) {
      await tx.execute("UPDATE dhikrs SET sort_order = ? WHERE id = ?", [
        i,
        order[i],
      ]);
    }
  });
}
