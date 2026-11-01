import type { TKey } from "../lib/i18n";

/** The standalone Notes app's two tabs. */
export interface HubTabDef {
  id: string;
  labelKey: TKey;
  icon: string;
}

export const NOTES_TABS: HubTabDef[] = [
  { id: "index", labelKey: "navNotes", icon: "note-text" },
  { id: "archive", labelKey: "notesArchiveTitle", icon: "archive" },
];
