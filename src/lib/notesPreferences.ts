import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NoteSort } from "./notes";

export type NoteViewMode = "grid" | "list";

export interface NotesPreferences {
  viewMode: NoteViewMode;
  sort: NoteSort;
}

const PREFERENCES_KEY = "notes_preferences";

const DEFAULTS: NotesPreferences = { viewMode: "grid", sort: "updated" };

function parsePreferences(raw: string): NotesPreferences {
  const parsed = JSON.parse(raw) as Partial<NotesPreferences>;
  return {
    viewMode: parsed.viewMode === "list" ? "list" : "grid",
    sort: parsed.sort === "created" || parsed.sort === "title" ? parsed.sort : "updated",
  };
}

export async function getNotesPreferences(): Promise<NotesPreferences> {
  try {
    const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
    return raw ? parsePreferences(raw) : DEFAULTS;
  } catch (error) {
    // Corrupt/unavailable storage must not block the list; fall back to defaults.
    console.warn("[notes] failed to read preferences", error);
    return DEFAULTS;
  }
}

export async function setNotesPreferences(preferences: NotesPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    // Non-critical: the view still updates in memory for this session.
    console.warn("[notes] failed to persist preferences", error);
  }
}
