/**
 * Tab bar definitions per module, shared by the real layouts and the onboarding
 * tutorial so the tour can never show a tab bar the app does not have.
 */
export interface HubTabDef {
  id: string;
  label: string;
  icon: string;
}

export const BUDGET_TABS: HubTabDef[] = [
  { id: "index", label: "Dashboard", icon: "view-dashboard" },
  { id: "savings", label: "Savings", icon: "piggy-bank" },
  { id: "loans", label: "Loans & cards", icon: "calculator" },
  { id: "settings", label: "Settings", icon: "cog" },
];

export const NOTES_TABS: HubTabDef[] = [
  { id: "index", label: "Notes", icon: "note-text" },
  { id: "archive", label: "Archive", icon: "archive" },
  { id: "settings", label: "Settings", icon: "cog" },
];

export const TASKS_TABS: HubTabDef[] = [
  { id: "index", label: "Tasks", icon: "check-square" },
  { id: "settings", label: "Settings", icon: "cog" },
];

export function hubTabs(appId: string): HubTabDef[] {
  if (appId === "tasks") return TASKS_TABS;
  if (appId === "notes") return NOTES_TABS;
  return BUDGET_TABS;
}
