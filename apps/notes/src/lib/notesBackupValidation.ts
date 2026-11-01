import { NOTE_COLORS } from "../constants/theme";
import { parseAttachments } from "./attachmentData";

type Row = Record<string, unknown>;
export interface BackupEnvelope {
  meta: { format: string; version: number; appVersion: string; exportedAt: string; platform: string };
  tables: { notes: Row[]; noteItems: Row[] };
}

const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const flag = (value: unknown) => value === 0 || value === 1;
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;

/** Validate Notes records from app backups and legacy mixed Hub backups. */
export function validateEnvelope(raw: unknown): { ok: true; data: BackupEnvelope } | { ok: false; error: string } {
  const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
  if (!object(raw) || !object(raw.meta) || !object(raw.tables)) return fail("Invalid backup structure");
  const { meta, tables } = raw;
  if (meta.format !== "personal-hub.backup" || !Number.isInteger(meta.version) || Number(meta.version) < 1 || Number(meta.version) > 7) return fail("Unsupported backup version");
  if (!Array.isArray(tables.notes) || !Array.isArray(tables.noteItems)) return fail("Missing notes or checklist items");
  const noteIds = new Set<number>();
  for (const row of tables.notes) {
    if (!object(row) || (row.id !== undefined && (!id(row.id) || noteIds.has(Number(row.id))))
      || typeof row.title !== "string" || typeof row.content !== "string"
      || (row.plain_text !== undefined && typeof row.plain_text !== "string")
      || !flag(row.is_pinned) || typeof row.color !== "string" || !Object.prototype.hasOwnProperty.call(NOTE_COLORS, row.color)
      || (row.kind !== undefined && row.kind !== "text" && row.kind !== "checklist")
      || (row.is_archived !== undefined && !flag(row.is_archived))
      || (Number(meta.version) >= 4 && row.is_archived === undefined)
      || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return fail("Invalid note record");
    try { parseAttachments(row.attachments); } catch { return fail("Invalid note attachments"); }
    if (row.id !== undefined) noteIds.add(Number(row.id));
  }
  const itemIds = new Set<number>();
  for (const row of tables.noteItems) {
    if (!object(row) || (row.id !== undefined && (!id(row.id) || itemIds.has(Number(row.id))))
      || typeof row.text !== "string" || !flag(row.checked) || !id(row.note_id) || !noteIds.has(Number(row.note_id))
      || !Number.isSafeInteger(row.position) || Number(row.position) < 0) return fail("Invalid checklist item or missing parent note");
    if (row.id !== undefined) itemIds.add(Number(row.id));
  }
  return { ok: true, data: { meta, tables: { notes: tables.notes, noteItems: tables.noteItems } } as unknown as BackupEnvelope };
}
