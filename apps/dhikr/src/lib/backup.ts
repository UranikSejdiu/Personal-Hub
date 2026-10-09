import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as db from "./db";
import { type Dhikr } from "../types/dhikr";
import { clearSelectedDhikrIdIfMissing } from "./dhikrSelection";
import { flushDhikrWrites } from "./dhikr";
import { saveBackupToFolder } from "./saveBackupToFolder";

const FORMAT = "dhikr.backup";
const MAX_BYTES = 50 * 1024 * 1024;
const SAFETY_NAME = "dhikr-safety-backup.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseBackup(json: string): Dhikr[] {
  if (json.length > MAX_BYTES) throw new Error("Backup is too large.");
  const value: unknown = JSON.parse(json);
  if (!isObject(value) || !isObject(value.meta) || !isObject(value.tables)) {
    throw new Error("Invalid backup format.");
  }
  const { format, version } = value.meta;
  const compatible = (format === FORMAT && version === 1) ||
    (format === "personal-hub.backup" && typeof version === "number" && Number.isInteger(version) && version >= 1 && version <= 5);
  if (!compatible || !Array.isArray(value.tables.dhikrs)) throw new Error("Unsupported backup format or version.");
  const ids = new Set<number>();
  return value.tables.dhikrs.map((row: unknown): Dhikr => {
    if (!isObject(row) || !isCount(row.id) || row.id === 0 || ids.has(row.id) ||
        typeof row.name !== "string" || !row.name.trim() ||
        !isCount(row.total_count) || !isCount(row.daily_count) || !isCount(row.sort_order) ||
        !(row.daily_limit === null || isCount(row.daily_limit)) ||
        !isDate(row.last_reset_date) || typeof row.created_at !== "string" || !row.created_at) {
      throw new Error("Invalid Dhikr record in backup.");
    }
    ids.add(row.id);
    return {
      id: row.id, name: row.name, total_count: row.total_count, daily_count: row.daily_count,
      daily_limit: row.daily_limit, last_reset_date: row.last_reset_date,
      sort_order: row.sort_order, created_at: row.created_at,
    };
  });
}

async function envelope() {
  await flushDhikrWrites();
  return {
    meta: { format: FORMAT, version: 1, exportedAt: new Date().toISOString() },
    tables: { dhikrs: await db.query<Dhikr>("SELECT * FROM dhikrs ORDER BY sort_order, id") },
  };
}

export async function readBackupFile(uri: string): Promise<string> {
  const file = new File(uri);
  if (!file.exists || file.size > MAX_BYTES) throw new Error("Backup is missing or too large.");
  return file.text();
}

export async function exportBackupToDirectory(): Promise<string | null> {
  return saveBackupToFolder("dhikr-backup", async () => JSON.stringify(await envelope(), null, 2));
}

export async function exportBackup(): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable.");
  const file = new File(Paths.cache, `dhikr-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  file.write(JSON.stringify(await envelope(), null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
}

export function hasSafetyBackup(): boolean {
  return new File(Paths.document, SAFETY_NAME).exists;
}

async function replaceRows(rows: Dhikr[]): Promise<void> {
  await flushDhikrWrites();
  await db.withTransaction(async tx => {
    await tx.execute("DELETE FROM dhikrs");
    for (const row of rows) {
      await tx.execute(`INSERT INTO dhikrs (id, name, total_count, daily_count, daily_limit, last_reset_date, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.id, row.name, row.total_count, row.daily_count, row.daily_limit, row.last_reset_date, row.sort_order, row.created_at]);
    }
  });
  await clearSelectedDhikrIdIfMissing(rows.map(row => row.id));
}

export async function importBackup(json: string): Promise<void> {
  const rows = parseBackup(json);
  const temp = new File(Paths.document, `${SAFETY_NAME}.tmp`);
  temp.write(JSON.stringify(await envelope(), null, 2));
  temp.move(new File(Paths.document, SAFETY_NAME), { overwrite: true });
  await replaceRows(rows);
}

export async function restoreSafetyBackup(): Promise<void> {
  const file = new File(Paths.document, SAFETY_NAME);
  await replaceRows(parseBackup(await readBackupFile(file.uri)));
}
