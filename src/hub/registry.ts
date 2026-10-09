import type { TKey } from "../lib/i18n";

export interface HubApp {
  id: string;
  titleKey: TKey;
  icon: string;
  route: string;
}

export const HUB_APPS: HubApp[] = [
  { id: "budget", titleKey: "appBudget", icon: "wallet", route: "/(budget)" },
  { id: "notes", titleKey: "appNotes", icon: "note-text", route: "/(notes)" },
  { id: "tasks", titleKey: "appTasks", icon: "list-check", route: "/(tasks)" },
];

export function getHubApp(id: string): HubApp | undefined {
  return HUB_APPS.find((a) => a.id === id);
}

export function getHubRoute(appId: string): string {
  return getHubApp(appId)?.route ?? "/(budget)";
}
