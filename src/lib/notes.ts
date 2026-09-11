import * as db from "./db";
import { NOTE_COLORS, NOTE_TEXT_COLORS, type NoteColor } from "../constants/theme";
import { type Note } from "../types/notes";
import { contentToMarkdown } from "./noteContent";
import { isLexicalJson, extractLexicalLines } from "./lexicalPreview";

export type { Note };

const VALID_NOTE_COLORS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

function isValidNoteColor(color: string): color is NoteColor {
  return (VALID_NOTE_COLORS as string[]).includes(color);
}

export function getNoteColorClass(color: NoteColor, isDark: boolean): string {
  const entry = NOTE_COLORS[color];
  if (!entry) return "bg-card";
  return isDark ? entry.dark : entry.light;
}

export function getNoteTextColorClass(color: NoteColor, isDark: boolean): string {
  const entry = NOTE_TEXT_COLORS[color];
  if (!entry) return "text-foreground";
  return isDark ? entry.dark : entry.light;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

export async function loadNotes(): Promise<Note[]> {
  await ensurePlainTextBackfill();
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM notes ORDER BY is_pinned DESC, updated_at DESC"
  );
  return rows.map(toNote);
}

let backfillPromise: Promise<void> | null = null;

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
      // Pass 2: repair rows where plain_text was polluted by Lexical JSON
      // (plain_text containing JSON key patterns like "root", "children", "type")
      const polluted = await db.query<Record<string, unknown>>(
        "SELECT id, content, plain_text FROM notes WHERE plain_text != '' AND plain_text LIKE '%\"root\"%' AND plain_text LIKE '%\"children\"%'"
      );
      for (const row of polluted) {
        const plain = getPlainTextFromContent(String(row.content));
        await db.execute("UPDATE notes SET plain_text = ? WHERE id = ?", [
          plain,
          Number(row.id),
        ]);
      }
    } catch (error) {
      backfillPromise = null;
      throw error;
    }
  })();
  return backfillPromise;
}

export async function searchNotes(query: string): Promise<Note[]> {
  await ensurePlainTextBackfill();
  const normalized = query.trim().toLowerCase();
  const pattern = `%${normalized}%`;
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM notes WHERE plain_text LIKE ? OR title LIKE ? ORDER BY is_pinned DESC, updated_at DESC",
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
  fields: Pick<Note, "title" | "content" | "color" | "is_pinned">
): Promise<Note> {
  const result = await db.execute(
    "INSERT INTO notes (title, content, is_pinned, color, plain_text) VALUES (?, ?, ?, ?, ?)",
    [
      fields.title,
      fields.content,
      fields.is_pinned ? 1 : 0,
      fields.color,
      getPlainTextFromContent(fields.content),
    ]
  );
  const created = await db.get<Record<string, unknown>>(
    "SELECT * FROM notes WHERE id = ?",
    [result.lastId]
  );
  if (!created) throw new Error("Failed to create note.");
  return toNote(created);
}

export async function updateNote(
  id: number,
  fields: Partial<Pick<Note, "title" | "content" | "is_pinned" | "color">>
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
  if (fields.color !== undefined) {
    sets.push("color = ?");
    values.push(fields.color);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  await db.execute(
    `UPDATE notes SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteNote(id: number): Promise<void> {
  await db.execute("DELETE FROM notes WHERE id = ?", [id]);
}
