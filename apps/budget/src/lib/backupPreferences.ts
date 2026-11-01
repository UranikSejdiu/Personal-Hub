import { getPreferenceSync, setPreference } from "./preferences";

export interface BackupPreferences {
  theme?: "light" | "dark";
  haptics?: boolean;
  notes?: { viewMode: "grid" | "list"; sort: "updated" | "created" | "title" };
}

export function validateBackupPreferences(value: unknown): BackupPreferences | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backup preferences");
  const source = value as Record<string, unknown>;
  if (source.theme !== undefined && source.theme !== "light" && source.theme !== "dark") throw new Error("Invalid theme preference");
  if (source.haptics !== undefined && typeof source.haptics !== "boolean") throw new Error("Invalid vibration preference");
  if (source.notes !== undefined) {
    const notes = source.notes as Record<string, unknown>;
    if (!notes || !["grid", "list"].includes(String(notes.viewMode)) || !["updated", "created", "title"].includes(String(notes.sort))) throw new Error("Invalid Notes preferences");
  }
  return source as BackupPreferences;
}

export async function readBackupPreferences(): Promise<BackupPreferences> {
  const preferences: BackupPreferences = {};
  try {
    const theme = getPreferenceSync("app_theme");
    if (theme === "light" || theme === "dark") preferences.theme = theme;
  } catch { /* Optional preferences must not prevent a record backup. */ }
  return preferences;
}

/** Record imports are already committed; report preference failures separately. */
export async function applyBackupPreferences(preferences: BackupPreferences | undefined): Promise<boolean> {
  if (!preferences) return true;
  try {
    if (preferences.theme) await setPreference("app_theme", preferences.theme);
    // Accept legacy haptics fields when importing, but this app no longer uses them.
    return true;
  } catch { return false; }
}
