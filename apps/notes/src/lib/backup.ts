import * as db from "./db";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import identity from "../appIdentity.json";
import { getAppVersion } from "../constants/config";
import { validateEnvelope, type BackupEnvelope } from "./notesBackupValidation";
import { saveBackupToFolder } from "./saveBackupToFolder";
import { resetPlainTextBackfill } from "./notes";
import { applyBackupPreferences, readBackupPreferences, validateBackupPreferences, type BackupPreferences } from "./backupPreferences";

type Row = Record<string, unknown>;
type Envelope = { meta: { format: string; version: number; appVersion: string; exportedAt: string; platform: string }; tables: Record<string, Row[] | Row | null>; sequences?: Record<string, number>; preferences?: BackupPreferences };
const TABLES = Object.entries(identity.tables);
const SAFETY = `${identity.id}-safety-backup.json`;
const MAX_BYTES = 50 * 1024 * 1024;
let importing = false;

function object(value: unknown): value is Row { return !!value && typeof value === "object" && !Array.isArray(value); }

function exceedsUtf8Limit(text: string): boolean {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index++; }
    else bytes += 3;
    if (bytes > MAX_BYTES) return true;
  }
  return false;
}

/** Normalize only this app's tables, then use the established Hub validators. */
export function parseBackup(json: string): { envelope: BackupEnvelope; sequences: Record<string, number>; preferences?: BackupPreferences } {
  if (json.length > MAX_BYTES || exceedsUtf8Limit(json)) throw new Error("Backup exceeds 50 MB");
  const raw: unknown = JSON.parse(json);
  if (!object(raw) || !object(raw.meta) || !object(raw.tables)) throw new Error("Invalid backup");
  const own = raw.meta.format === identity.backupFormat;
  const legacy = raw.meta.format === "personal-hub.backup";
  if ((!own && !legacy) || (own && raw.meta.version !== 1 && raw.meta.version !== 2) || (legacy && (!Number.isInteger(raw.meta.version) || Number(raw.meta.version) < 1 || Number(raw.meta.version) > 7))) throw new Error("This backup belongs to another app or an unsupported version");
  const version = own ? 7 : Number(raw.meta.version);
  const tables: Row = { notes: [], noteItems: [] };
  for (const [key] of TABLES) {
    const value = raw.tables[key];
    const optionalLegacy = legacy && key === "noteItems" && version < 4;
    if (value === undefined && !optionalLegacy) throw new Error(`Backup does not contain ${identity.title} data (${key})`);
    if (value !== undefined) tables[key] = value;
    if (Array.isArray(value)) {
      const ids = new Set<unknown>();
      for (const row of value) {
        if (!object(row)) throw new Error(`Invalid ${key} row`);
        if (row.id !== undefined) {
          if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || ids.has(row.id)) throw new Error(`Invalid or duplicate ${key} ID`);
          ids.add(row.id);
        }
      }
    }
  }
  const checked = validateEnvelope({ meta: { ...raw.meta, format: "personal-hub.backup", version }, tables });
  if (!checked.ok) throw new Error(checked.error);
  const sequences: Record<string, number> = {};
  if (raw.sequences !== undefined) {
    if (!object(raw.sequences)) throw new Error("Invalid ID sequences");
    for (const [, table] of TABLES) {
      const value = raw.sequences[table];
      if (value !== undefined) {
        if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error("Invalid ID sequence");
        sequences[table] = Number(value);
      }
    }
  }
  return { envelope: checked.data, sequences, preferences: validateBackupPreferences(raw.preferences) };
}

async function snapshot(tx: db.DbExecutor): Promise<Envelope> {
  const tables: Envelope["tables"] = {};
  for (const [key, table] of TABLES) {
    const rows = await tx.query<Row>(`SELECT * FROM ${table}`);
    tables[key] = rows;
  }
  const sequences: Record<string, number> = {};
  for (const row of await tx.query<{ name: string; seq: number }>("SELECT name, seq FROM sqlite_sequence")) {
    if (TABLES.some(([, table]) => table === row.name)) sequences[row.name] = row.seq;
  }
  const preferences = await readBackupPreferences();
  const envelope = { meta: { format: identity.backupFormat, version: 2, appVersion: getAppVersion(), exportedAt: new Date().toISOString(), platform: Platform.OS }, tables, sequences, preferences };
  parseBackup(JSON.stringify(envelope)); // Never report a successful export that cannot be imported.
  return envelope;
}

export function buildBackupEnvelope(): Promise<Envelope> { return db.withTransaction(snapshot); }

export function hasSafetyBackup(): boolean { return new File(Paths.document, SAFETY).exists; }

export async function exportBackupToDirectory(): Promise<string | null> {
  return saveBackupToFolder(`${identity.id}-backup`, async () => JSON.stringify(await buildBackupEnvelope(), null, 2));
}

export async function exportBackup(): Promise<string> {
  const envelope = await buildBackupEnvelope();
  const file = new File(Paths.cache, `${identity.id}-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  file.write(JSON.stringify(envelope, null, 2));
  try {
    const exports = Paths.cache.list().filter((entry): entry is File => entry instanceof File && entry.name.startsWith(`${identity.id}-backup-`) && entry.name.endsWith(".json")).sort((a, b) => b.name.localeCompare(a.name));
    for (const stale of exports.slice(3)) stale.delete();
  } catch { /* Cleanup must not invalidate a completed export. */ }
  if (!await Sharing.isAvailableAsync()) throw new Error("Sharing is unavailable; use Save to folder");
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: `${identity.title} backup`, UTI: "public.json" });
  return file.uri;
}

export async function readBackupFile(uri: string): Promise<string> {
  const file = new File(uri);
  if (!file.exists || (file.size !== null && file.size > MAX_BYTES)) throw new Error("Backup is missing or exceeds 50 MB");
  try { return await file.text(); }
  finally {
    if (file.uri.startsWith(`${Paths.cache.uri.replace(/\/$/, "")}/`)) {
      try { file.delete(); } catch { /* A provider may keep the picker copy locked. */ }
    }
  }
}

export function previewBackup(json: string): string {
  const { envelope } = parseBackup(json);
  return TABLES.map(([key]) => {
    const value = envelope.tables[key as keyof typeof envelope.tables];
    return `${key}: ${Array.isArray(value) ? value.length : value ? 1 : 0}`;
  }).join(" · ");
}

async function replace(json: string, recovery: boolean): Promise<{ preferencesRestored: boolean; preferences?: BackupPreferences }> {
  if (importing) throw new Error("A restore is already in progress");
  importing = true;
  try {
    const { envelope, sequences, preferences } = parseBackup(json);
    await db.withTransaction(async tx => {
      if (!recovery) {
        const temp = new File(Paths.document, `${SAFETY}.tmp`);
        temp.write(JSON.stringify(await snapshot(tx), null, 2));
        temp.move(new File(Paths.document, SAFETY), { overwrite: true });
      }
      // Children are removed first. The original Hub database is never opened.
      for (const [, table] of [...TABLES].reverse()) await tx.execute(`DELETE FROM ${table}`);
      for (const [key, table] of TABLES) {
        const value = envelope.tables[key as keyof typeof envelope.tables];
        const rows = Array.isArray(value) ? value : value ? [value] : [];
        const columns = new Set((await tx.query<{ name: string }>(`PRAGMA table_info(${table})`)).map(column => column.name));
        for (const source of rows) {
          const row = { ...source };
          const entries = Object.entries(row).filter(([column, value]) => columns.has(column) && value !== undefined);
          if (!entries.length) throw new Error(`Empty ${table} row`);
          await tx.execute(`INSERT INTO ${table} (${entries.map(([column]) => `"${column}"`).join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`, entries.map(([, value]) => value));
        }
      }
      for (const [table, sequence] of Object.entries(sequences)) {
        const existing = await tx.get<{ seq: number }>("SELECT seq FROM sqlite_sequence WHERE name = ?", [table]);
        if (existing) await tx.execute("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?", [sequence, table]);
        else await tx.execute("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)", [table, sequence]);
      }
      // Validate the records actually written before committing the replacement.
      await snapshot(tx);
    });
    resetPlainTextBackfill();
    return { preferencesRestored: await applyBackupPreferences(preferences, true), preferences };
  } finally { importing = false; }
}

export function importBackup(json: string) { return replace(json, false); }
export async function restoreSafetyBackup() {
  const file = new File(Paths.document, SAFETY);
  if (!file.exists) throw new Error("No recovery copy available");
  return replace(await file.text(), true);
}
