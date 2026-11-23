/** The standalone Notes app's two tabs. */
export interface HubTabDef {
  id: string;
  label: string;
  icon: string;
}

export const NOTES_TABS: HubTabDef[] = [
  { id: "index", label: "Notes", icon: "note-text" },
  { id: "archive", label: "Archive", icon: "archive" },
];
