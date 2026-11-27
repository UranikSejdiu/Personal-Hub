import * as db from "./db";
import { parseAttachments, serializeAttachments, type NoteAttachment } from "./attachmentData";
import type { NoteKind } from "../types/notes";

export interface DraftSummary {
  draft_key: string;
  kind: NoteKind;
  note_id: number | null;
  title: string;
}

export interface DraftContents {
  title: string;
  pinned: boolean;
  body: string;
  attachments: NoteAttachment[];
}

export function listDrafts() {
  return db.query<DraftSummary>("SELECT draft_key, kind, note_id, title FROM note_drafts ORDER BY updated DESC");
}

export function discardDraft(key: string, tx = db.defaultExecutor) {
  return tx.execute("DELETE FROM note_drafts WHERE draft_key = ?", [key]);
}

// Each editor has at most one write in flight and one newer snapshot waiting.
// Media bytes are written only when the attachment array changes.
export function draftSession(kind: NoteKind, id: number | null, newKey?: string) {
  const key = id === null && newKey?.startsWith(`${kind}:new-`) ? newKey : `${kind}:${id ?? "new"}`;
  let media: NoteAttachment[] | undefined;
  let pending: DraftContents | null | undefined;
  let running: Promise<void> | undefined;
  let paused = false;

  async function persist(value: DraftContents | null) {
    if (value === null) {
      await discardDraft(key);
      media = undefined;
      return;
    }
    const saveBody = (tx: db.DbExecutor) => tx.execute(
      `INSERT INTO note_drafts (draft_key, kind, note_id, title, pinned, body, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(draft_key) DO UPDATE SET
       title=excluded.title, pinned=excluded.pinned, body=excluded.body, updated=excluded.updated`,
      [key, kind, id, value.title, Number(value.pinned), value.body, Date.now()]);
    if (media === value.attachments || (!media && !value.attachments.length)) {
      await saveBody(db.defaultExecutor);
    } else {
      await db.withTransaction(async tx => {
        await saveBody(tx);
        if (value.attachments.length) {
          await tx.execute("INSERT OR REPLACE INTO note_draft_media (draft_key, attachments) VALUES (?, ?)",
            [key, serializeAttachments(value.attachments)]);
        } else {
          await tx.execute("DELETE FROM note_draft_media WHERE draft_key = ?", [key]);
        }
      });
    }
    media = value.attachments;
  }

  async function drain() {
    try {
      while (pending !== undefined) {
        const value = pending;
        pending = undefined;
        try { await persist(value); }
        catch (error) { if (pending === undefined) throw error; }
      }
    } finally {
      running = undefined;
    }
  }

  return {
    async read(): Promise<DraftContents | undefined> {
      const row = await db.get<{title: string; pinned: number; body: string; attachments: string | null}>(
        `SELECT title, pinned, body, attachments FROM note_drafts
         LEFT JOIN note_draft_media USING (draft_key) WHERE draft_key = ?`, [key]);
      if (!row) return;
      media = parseAttachments(row.attachments);
      return { title: row.title, pinned: Boolean(row.pinned), body: row.body, attachments: media };
    },
    write(value: DraftContents | null) {
      if (paused) return Promise.resolve();
      pending = value;
      running ??= drain();
      return running;
    },
    async finish<T>(commit: (tx: db.DbExecutor) => Promise<T>) {
      paused = true;
      try {
        await running?.catch(() => {});
        return await db.withTransaction(async tx => {
          const result = await commit(tx);
          await discardDraft(key, tx);
          return result;
        });
      } catch (error) {
        paused = false;
        throw error;
      }
    },
  };
}
