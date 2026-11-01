export interface NoteAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "audio" | "file";
  base64: string;
}

export type AttachmentAction = "image" | "camera" | "audio" | "file";
export interface AttachmentActions { add: (kind: AttachmentAction) => Promise<void> }

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_NOTE_DATA = 16 * 1024 * 1024;

/** A self-contained payload: media survives backups, restores and device moves. */
export function parseAttachments(value: unknown): NoteAttachment[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string" || value.length > MAX_NOTE_DATA) throw new Error("Attachments exceed 16 MB per note.");
  return validateRows(JSON.parse(value));
}

function validateRows(rows: unknown): NoteAttachment[] {
  if (!Array.isArray(rows) || rows.length > 10) throw new Error("A note can contain up to 10 attachments.");
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id) || ids.has(row.id)
      || typeof row.name !== "string" || !row.name.length || row.name.length > 200
      || typeof row.mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(row.mimeType)
      || !["image", "audio", "file"].includes(row.kind)
      || (row.kind === "image" && !["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"].includes(row.mimeType))
      || (row.kind === "audio" && !row.mimeType.startsWith("audio/"))
      || typeof row.base64 !== "string" || !row.base64.length || row.base64.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4
      || row.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(row.base64)
      || row.base64.length / 4 * 3 - (row.base64.endsWith("==") ? 2 : row.base64.endsWith("=") ? 1 : 0) > MAX_ATTACHMENT_BYTES) {
      throw new Error("Invalid note attachment.");
    }
    ids.add(row.id);
  }
  return rows as NoteAttachment[];
}

export function serializeAttachments(rows: NoteAttachment[]): string {
  validateRows(rows);
  const value = JSON.stringify(rows);
  if (value.length > MAX_NOTE_DATA) throw new Error("Attachments exceed 16 MB per note.");
  return value;
}
