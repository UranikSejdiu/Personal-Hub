import { type NoteColor } from "../constants/theme";

export type NoteKind = "text" | "checklist";

export interface NoteItem {
  id: number;
  note_id: number;
  text: string;
  checked: boolean;
  position: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  kind: NoteKind;
  is_pinned: boolean;
  color: NoteColor;
  created_at: string;
  updated_at: string;
  /** Populated for checklist notes loaded through the list/get helpers. */
  items?: NoteItem[];
  /** List previews contain only the first six active items, with full counts. */
  checklistPreview?: { total: number; checked: number; active: number };
}
