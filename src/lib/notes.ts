import * as db from "./db";
import { type NoteColor } from "../constants/theme";
import { type Note, type NoteItem, type NoteKind } from "../types/notes";
import { contentToMarkdown } from "./noteContent";
import { isLexicalJson } from "./lexicalPreview";

export type { Note, NoteItem, NoteKind };

/** A checklist item in its pre-persist form (no id/position assigned yet). */
export interface NewChecklistItem {
  text: string;
  checked: boolean;
}

/** Sort orders offered by the notes list. Pinned notes always sort first. */
export type NoteSort = "updated" | "created" | "title";

const VALID_NOTE_COLORS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

function isValidNoteColor(color: string): color is NoteColor {
  return (VALID_NOTE_COLORS as string[]).includes(color);
}

function isNoteKind(kind: string): kind is NoteKind {
  return kind === "text" || kind === "checklist";
}

/**
 * The plain-text/index form of a checklist. Shares the `- [x]` / `- [ ]`
 * markdown shape the rich-text converter emits, so search and the existing
 * markdown preview helpers treat both note kinds uniformly.
 */
function plainTextFromItems(items: readonly NewChecklistItem[]): string {
  return items.map((item) => `${item.checked ? "- [x]" : "- [ ]"} ${item.text}`).join("\n");
}

function orderBy(sort: NoteSort): string {
  const secondary =
    sort === "created"
      ? "created_at DESC, id DESC"
      : sort === "title"
        ? "title COLLATE NOCASE ASC, id DESC"
        : "updated_at DESC, id DESC";
  return `is_pinned DESC, ${secondary}`;
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
  const rawKind = String(row.kind ?? "text");
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    kind: isNoteKind(rawKind) ? rawKind : "text",
    is_pinned: Number(row.is_pinned) === 1,
    is_archived: Number(row.is_archived) === 1,
    color: isValidNoteColor(rawColor) ? rawColor : "default",
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function toNoteItem(row: Record<string, unknown>): NoteItem {
  return {
    id: Number(row.id),
    note_id: Number(row.note_id),
    text: String(row.text ?? ""),
    checked: Number(row.checked) === 1,
    position: Number(row.position) || 0,
  };
}

// The list only renders a short preview, so ship a bounded slice of the
// pre-derived plain text instead of every note's full content blob.
const LIST_COLUMNS =
  "id, title, substr(plain_text, 1, 2000) AS content, kind, is_pinned, is_archived, color, created_at, updated_at";

const ITEM_COLUMNS = "id, note_id, text, checked, position";

/**
 * Attach full checklist items for existing callers, or three active preview items
 * and aggregate counts for paginated cards. Editors still load complete items.
 */
async function attachChecklistItems(notes: Note[], preview = false): Promise<Note[]> {
  const ids = notes.filter((note) => note.kind === "checklist").map((note) => note.id);
  if (ids.length === 0) return notes;
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await db.query<Record<string, unknown>>(
    preview
      ? `SELECT id, note_id, substr(text, 1, 300) AS text, checked, position FROM (
           SELECT ${ITEM_COLUMNS}, ROW_NUMBER() OVER (PARTITION BY note_id ORDER BY position, id) AS preview_rank
           FROM note_items WHERE checked = 0 AND note_id IN (${placeholders})
         ) WHERE preview_rank <= 3 ORDER BY note_id, position, id`
      : `SELECT ${ITEM_COLUMNS} FROM note_items WHERE note_id IN (${placeholders}) ORDER BY note_id, position, id`,
    ids
  );
  const counts = preview ? await db.query<{ note_id: number; total: number; checked: number }>(
    `SELECT note_id, COUNT(*) AS total, SUM(checked) AS checked FROM note_items WHERE note_id IN (${placeholders}) GROUP BY note_id`, ids
  ) : [];
  const countsByNote = new Map(counts.map((row) => [row.note_id, { total: row.total, checked: row.checked, active: row.total - row.checked }]));
  const byNote = new Map<number, NoteItem[]>();
  for (const row of rows) {
    const item = toNoteItem(row);
    const existing = byNote.get(item.note_id);
    if (existing) existing.push(item);
    else byNote.set(item.note_id, [item]);
  }
  return notes.map((note) =>
    note.kind === "checklist" ? { ...note, items: byNote.get(note.id) ?? [], ...(preview ? { checklistPreview: countsByNote.get(note.id) ?? { total: 0, checked: 0, active: 0 } } : {}) } : note
  );
}

interface ListPageOptions { limit: number; offset: number }

export async function loadNotes(sort: NoteSort = "updated", page?: ListPageOptions, archived = false): Promise<Note[]> {
  await ensurePlainTextBackfill();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS} FROM notes WHERE is_archived = ? ORDER BY ${orderBy(sort)}${page ? " LIMIT ? OFFSET ?" : ""}`,
    page ? [archived ? 1 : 0, page.limit, page.offset] : [archived ? 1 : 0]
  );
  return attachChecklistItems(rows.map(toNote), Boolean(page));
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
      // still returned as-is and the backfill is retried on the next read.
      backfillPromise = null;
      console.warn("[notes] plain_text backfill failed", error);
    }
  })();
  return backfillPromise;
}

export async function searchNotes(query: string, sort: NoteSort = "updated", page?: ListPageOptions, archived = false): Promise<Note[]> {
  await ensurePlainTextBackfill();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return loadNotes(sort, page, archived);

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
          WHERE is_archived = ? AND id IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)
          ORDER BY ${orderBy(sort)}${page ? " LIMIT ? OFFSET ?" : ""}`,
        page ? [archived ? 1 : 0, ftsQuery, page.limit, page.offset] : [archived ? 1 : 0, ftsQuery]
      );
      return attachChecklistItems(rows.map(toNote), Boolean(page));
    } catch {
      // Malformed FTS query — fall through to the LIKE path below.
    }
  }

  const escaped = normalized.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${LIST_COLUMNS} FROM notes WHERE is_archived = ? AND (plain_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') ORDER BY ${orderBy(sort)}${page ? " LIMIT ? OFFSET ?" : ""}`,
    page ? [archived ? 1 : 0, pattern, pattern, page.limit, page.offset] : [archived ? 1 : 0, pattern, pattern]
  );
  return attachChecklistItems(rows.map(toNote), Boolean(page));
}

/** Bounded list query; editors continue to load complete note contents and items. */
export async function loadNotesPage(query: string, sort: NoteSort, offset = 0, limit = 40, archived = false): Promise<{ notes: Note[]; hasMore: boolean; nextOffset: number }> {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid notes page");
  }
  const page = { limit: limit + 1, offset };
  const result = query.trim() ? await searchNotes(query, sort, page, archived) : await loadNotes(sort, page, archived);
  const notes = result.slice(0, limit);
  return { notes, hasMore: result.length > limit, nextOffset: offset + notes.length };
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
  exec?: db.DbExecutor
): Promise<Note> {
  if (!exec) return db.withTransaction((tx) => createNote(fields, tx));
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
  fields: Partial<Pick<Note, "title" | "content" | "is_pinned" | "is_archived">>,
  exec: db.DbExecutor = db.defaultExecutor
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
  if (fields.is_archived !== undefined) {
    sets.push("is_archived = ?");
    values.push(fields.is_archived ? 1 : 0);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  const result = await exec.execute(
    `UPDATE notes SET ${sets.join(", ")} WHERE id = ? AND is_archived = 0`,
    values
  );
  if (result.changes !== 1) throw new Error("Note not found or archived.");
}

/** Restore without rewriting frozen content, search text, or checklist items. */
export async function restoreNote(id: number, exec: db.DbExecutor = db.defaultExecutor): Promise<void> {
  const result = await exec.execute(
    "UPDATE notes SET is_archived = 0, updated_at = datetime('now') WHERE id = ? AND is_archived = 1",
    [id]
  );
  if (result.changes !== 1) throw new Error("Archived note not found.");
}

async function insertChecklistItems(
  exec: db.DbExecutor,
  noteId: number,
  items: readonly NewChecklistItem[]
): Promise<void> {
  for (let position = 0; position < items.length; position++) {
    const item = items[position];
    await exec.execute(
      "INSERT INTO note_items (note_id, text, checked, position) VALUES (?, ?, ?, ?)",
      [noteId, item.text, item.checked ? 1 : 0, position]
    );
  }
}

/** Items of a checklist note, in display order. */
export async function getChecklistItems(noteId: number): Promise<NoteItem[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT ${ITEM_COLUMNS} FROM note_items WHERE note_id = ? ORDER BY position, id`,
    [noteId]
  );
  return rows.map(toNoteItem);
}

export async function createChecklistNote(
  fields: Pick<Note, "title" | "is_pinned">,
  items: readonly NewChecklistItem[],
  exec?: db.DbExecutor
): Promise<Note> {
  if (!exec) {
    return db.withTransaction((tx) => createChecklistNote(fields, items, tx));
  }
  const result = await exec.execute(
    "INSERT INTO notes (title, content, kind, is_pinned, color, plain_text) VALUES (?, '', 'checklist', ?, 'default', ?)",
    [fields.title, fields.is_pinned ? 1 : 0, plainTextFromItems(items)]
  );
  const noteId = result.lastId;
  if (!noteId) throw new Error("Failed to create note.");
  await insertChecklistItems(exec, noteId, items);
  const created = await exec.get<Record<string, unknown>>(
    "SELECT * FROM notes WHERE id = ?",
    [noteId]
  );
  if (!created) throw new Error("Failed to create note.");
  return toNote(created);
}

/**
 * Replace a checklist note's items and title atomically. An existing transaction
 * can supply its executor; standalone calls open their own. `plain_text` is
 * rebuilt so search and `updated_at` ordering stay in sync with visible items.
 */
export async function saveChecklistNote(
  noteId: number,
  fields: Pick<Note, "title" | "is_pinned"> & Partial<Pick<Note, "is_archived">>,
  items: readonly NewChecklistItem[],
  exec?: db.DbExecutor
): Promise<void> {
  if (!exec) return db.withTransaction((tx) => saveChecklistNote(noteId, fields, items, tx));
  const result = await exec.execute(
    "UPDATE notes SET title = ?, is_pinned = ?, is_archived = COALESCE(?, is_archived), plain_text = ?, updated_at = datetime('now') WHERE id = ? AND kind = 'checklist' AND is_archived = 0",
    [fields.title, fields.is_pinned ? 1 : 0, fields.is_archived === undefined ? null : fields.is_archived ? 1 : 0, plainTextFromItems(items), noteId]
  );
  if (result.changes !== 1) throw new Error("Checklist not found or archived.");
  await exec.execute("DELETE FROM note_items WHERE note_id = ?", [noteId]);
  await insertChecklistItems(exec, noteId, items);
}

export async function deleteNote(
  id: number,
  exec?: db.DbExecutor
): Promise<void> {
  if (!exec) return db.withTransaction((tx) => deleteNote(id, tx));
  // Delete items explicitly rather than relying on `ON DELETE CASCADE`: a
  // transaction runs on its own connection, where the `foreign_keys` pragma
  // set on the main connection is not guaranteed to be in effect.
  await exec.execute("DELETE FROM note_items WHERE note_id = ?", [id]);
  await exec.execute("DELETE FROM notes WHERE id = ?", [id]);
}
