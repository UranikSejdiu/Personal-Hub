import * as db from "./db";
import { withTransaction } from "./db";
import { type Dhikr } from "../types/dhikr";

export type { Dhikr };

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

export function dailyProgress(dhikr: Dhikr): number {
  if (!dhikr.daily_limit || dhikr.daily_limit <= 0) return 0;
  return Math.min(
    100,
    Math.round((dhikr.daily_count / dhikr.daily_limit) * 100)
  );
}

export async function loadDhikrs(): Promise<Dhikr[]> {
  const today = todayDate();
  await db.execute(
    "UPDATE dhikrs SET daily_count = 0, last_reset_date = ? WHERE last_reset_date < ? AND daily_count > 0",
    [today, today]
  );
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM dhikrs ORDER BY sort_order ASC, created_at DESC"
  );
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
  fields: Partial<Pick<Dhikr, "name" | "daily_limit">>
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

export async function incrementDhikr(id: number): Promise<Dhikr | null> {
  const today = todayDate();
  const result = await db.execute(
    `UPDATE dhikrs SET
       total_count = total_count + 1,
       daily_count = CASE WHEN last_reset_date < ? THEN 1 ELSE daily_count + 1 END,
       last_reset_date = ?
     WHERE id = ?
       AND (daily_limit IS NULL OR daily_limit <= 0 OR CASE WHEN last_reset_date < ? THEN 0 ELSE daily_count END < daily_limit)`,
    [today, today, id, today]
  );
  if (result.changes === 0) {
    return null;
  }
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM dhikrs WHERE id = ?",
    [id]
  );
  if (!row) return null;
  return toDhikr(row);
}

export async function resetDhikr(id: number): Promise<void> {
  await db.execute(
    "UPDATE dhikrs SET total_count = 0, daily_count = 0, last_reset_date = ? WHERE id = ?",
    [todayDate(), id]
  );
}

export async function reorderDhikrs(order: number[]): Promise<void> {
  await withTransaction(async () => {
    for (let i = 0; i < order.length; i++) {
      await db.execute("UPDATE dhikrs SET sort_order = ? WHERE id = ?", [
        i,
        order[i],
      ]);
    }
  });
}
