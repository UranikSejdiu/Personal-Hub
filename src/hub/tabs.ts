import type { TKey } from "../lib/i18n";

/**
 * Tab bar definitions per module, shared by the real layouts and the onboarding
 * tutorial so the tour can never show a tab bar the app does not have.
 */
export interface HubTabDef {
  id: string;
  labelKey: TKey;
  icon: string;
}

export const BUDGET_TABS: HubTabDef[] = [
  { id: "index", labelKey: "navDashboard", icon: "view-dashboard" },
  { id: "savings", labelKey: "navSavings", icon: "piggy-bank" },
  { id: "loans", labelKey: "navLoans", icon: "calculator" },
  { id: "settings", labelKey: "navSettings", icon: "cog" },
];

export const DHIKR_TABS: HubTabDef[] = [
  { id: "index", labelKey: "navCounter", icon: "star-four-points" },
  { id: "list", labelKey: "navDhikrList", icon: "format-list-numbered" },
  { id: "settings", labelKey: "navSettings", icon: "cog" },
];

export const NOTES_TABS: HubTabDef[] = [
  { id: "index", labelKey: "navNotes", icon: "note-text" },
  { id: "archive", labelKey: "notesArchiveTitle", icon: "archive" },
  { id: "settings", labelKey: "navSettings", icon: "cog" },
];

export function hubTabs(appId: string): HubTabDef[] {
  if (appId === "dhikr") return DHIKR_TABS;
  if (appId === "notes") return NOTES_TABS;
  return BUDGET_TABS;
}
