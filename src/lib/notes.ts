import * as db from "./db";
import { type NoteColor } from "../constants/theme";
import { type Note } from "../types/notes";
import { contentToMarkdown } from "./noteContent";
import { isLexicalJson } from "./lexicalPreview";

export type { Note };

const VALID_NOTE_COLORS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

function isValidNoteColor(color: string): color is NoteColor {
  return (VALID_NOTE_COLORS as string[]).includes(color);
}

/**
 * Extract plain text from note content for search indexing.
 * Handles markdown (new), Block[] JSON, Lexical JSON, legacy HTML.
 */
function getPlainTextFromContent(content: string): string {
  if (!content) return "";
  const md = contentToMarkdown(content);
  return md;
}

function toNote(row: Record<string, unknown>): Note {
  const rawColor = String(row.color ?? "default");
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    is_pinned: Number(row.is_pinned) === 1,
    color: isValidNoteColor(rawColor) ? rawColor : "default",
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

// The list only renders a short preview, so ship a bounded slice of the
// pre-derived plain text instead of every note's full content blob.
const LIST_COLUMNS =
  "id, title, substr(plain_text, 1, 600) AS content, is_pinned, color, created_at, updated_at";

export async function loadNotes(): Promise<Note[]> {
  await ensurePlainTextBackfill();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS} FROM notes ORDER BY is_pinned DESC, updated_at DESC`
  );
  return rows.map(toNote);
}

let backfillPromise: Promise<void> | null = null;
let needsPollutedRepair = false;

/**
 * Invalidate the cached backfill so imported notes with an empty `plain_text`
 * are reindexed. Call after a restore replaces the notes table.
 */
export function resetPlainTextBackfill(): void {
  backfillPromise = null;
  // A restored backup can still carry legacy rows whose plain_text is raw
  // Lexical JSON; that data never went through the schema migration.
  needsPollutedRepair = true;
}

async function ensurePlainTextBackfill(): Promise<void> {
  if (backfillPromise) return backfillPromise;
  backfillPromise = (async () => {
    try {
      // Pass 1: backfill rows with empty plain_text
      const rows = await db.query<Record<string, unknown>>(
        "SELECT id, content FROM notes WHERE plain_text = '' AND content != ''"
      );
      for (const row of rows) {
        const plain = getPlainTextFromContent(String(row.content));
        await db.execute("UPDATE notes SET plain_text = ? WHERE id = ?", [
          plain,
          Number(row.id),
        ]);
      }
      // Pass 2 (only after a restore): repair rows where plain_text was
      // polluted by Lexical JSON. Local databases are repaired once by the
      // schema migration, so this scan is not repeated on every launch.
      if (needsPollutedRepair) {
        const polluted = await db.query<Record<string, unknown>>(
          "SELECT id, content, plain_text FROM notes WHERE plain_text != '' AND plain_text LIKE '%\"root\"%' AND plain_text LIKE '%\"children\"%'"
        );
        for (const row of polluted) {
          const content = String(row.content);
          if (!isLexicalJson(content)) continue;
          const plain = getPlainTextFromContent(content);
          await db.execute("UPDATE notes SET plain_text = ? WHERE id = ?", [
            plain,
            Number(row.id),
          ]);
        }
        needsPollutedRepair = false;
      }
    } catch (error) {
      // Best-effort: a failed backfill write must never fail the read. Rows are
      // still returned as-is and the backfill is retried on the next launch (or
      // after a restore via resetPlainTextBackfill).
      console.warn("[notes] plain_text backfill failed", error);
    }
  })();
  return backfillPromise;
}

export async function searchNotes(query: string): Promise<Note[]> {
  await ensurePlainTextBackfill();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return loadNotes();

  if (db.isNotesFtsEnabled()) {
    // Token-prefix match: closer to the old substring behaviour while letting
    // the FTS index do the work. Falls back to LIKE if the query is rejected.
    const ftsQuery = normalized
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token.replace(/"/g, '""')}"*`)
      .join(" AND ");
    try {
      const rows = await db.query<Record<string, unknown>>(
        `SELECT ${LIST_COLUMNS} FROM notes
          WHERE id IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)
          ORDER BY is_pinned DESC, updated_at DESC`,
        [ftsQuery]
      );
      return rows.map(toNote);
    } catch {
      // Malformed FTS query — fall through to the LIKE path below.
    }
  }

  const escaped = normalized.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS} FROM notes WHERE plain_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY is_pinned DESC, updated_at DESC`,
    [pattern, pattern]
  );
  return rows.map(toNote);
}

export async function getNote(id: number): Promise<Note | undefined> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM notes WHERE id = ?",
    [id]
  );
  if (!row) return undefined;
  return toNote(row);
}

export async function createNote(
  fields: Pick<Note, "title" | "content" | "is_pinned">,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<Note> {
  const result = await exec.execute(
    "INSERT INTO notes (title, content, is_pinned, color, plain_text) VALUES (?, ?, ?, ?, ?)",
    [
      fields.title,
      fields.content,
      fields.is_pinned ? 1 : 0,
      "default",
      getPlainTextFromContent(fields.content),
    ]
  );
  const created = await exec.get<Record<string, unknown>>(
    "SELECT * FROM notes WHERE id = ?",
    [result.lastId]
  );
  if (!created) throw new Error("Failed to create note.");
  return toNote(created);
}

export async function updateNote(
  id: number,
  fields: Partial<Pick<Note, "title" | "content" | "is_pinned">>
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (fields.title !== undefined) {
    sets.push("title = ?");
    values.push(fields.title);
  }
  if (fields.content !== undefined) {
    sets.push("content = ?");
    values.push(fields.content);
    sets.push("plain_text = ?");
    values.push(getPlainTextFromContent(fields.content));
  }
  if (fields.is_pinned !== undefined) {
    sets.push("is_pinned = ?");
    values.push(fields.is_pinned ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  await db.execute(
    `UPDATE notes SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteNote(
  id: number,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<void> {
  await exec.execute("DELETE FROM notes WHERE id = ?", [id]);
}
