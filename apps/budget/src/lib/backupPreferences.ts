import AsyncStorage from "@react-native-async-storage/async-storage";
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
    const haptics = getPreferenceSync("haptics_enabled");
    if (haptics === "true" || haptics === "false") preferences.haptics = haptics === "true";
  } catch { /* Optional preferences must not prevent a record backup. */ }
  try {
    const rawNotes = await AsyncStorage.getItem("notes_preferences");
    if (rawNotes) preferences.notes = validateBackupPreferences({ notes: JSON.parse(rawNotes) })?.notes;
  } catch { /* Match Notes' fallback when its display preference is malformed. */ }
  return preferences;
}

/** Record imports are already committed; report preference failures separately. */
export async function applyBackupPreferences(preferences: BackupPreferences | undefined, includeNotes: boolean): Promise<boolean> {
  if (!preferences) return true;
  try {
    if (preferences.theme) await setPreference("app_theme", preferences.theme);
    if (preferences.haptics !== undefined) await setPreference("haptics_enabled", String(preferences.haptics));
    if (includeNotes && preferences.notes) await AsyncStorage.setItem("notes_preferences", JSON.stringify(preferences.notes));
    return true;
  } catch { return false; }
}
