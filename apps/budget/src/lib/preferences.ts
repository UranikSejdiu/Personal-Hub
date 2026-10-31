import Storage from "expo-sqlite/kv-store";
import * as SecureStore from "expo-secure-store";

// These values are app preferences, not secrets. SQLite participates in Android
// backup; SecureStore's encryption keys do not transfer to another phone.
type PreferenceKey = "app_theme" | "haptics_enabled" | "app_has_seen_tutorial" | "app_sample_data_state";

function normalize(key: PreferenceKey, value: string | null): string | null {
  return key === "app_theme" && value === "tawheed" ? "dark" : value;
}

/** Read only during theme initialization; migration runs after mounting. */
export function getPreferenceSync(key: PreferenceKey): string | null {
  const stored = Storage.getItemSync(key);
  if (stored !== null) return normalize(key, stored);
  try {
    return normalize(key, SecureStore.getItem(key));
  } catch {
    return null;
  }
}

/** Preserve old installations, but always prefer data restored from backup. */
export async function getPreference(key: PreferenceKey): Promise<string | null> {
  const stored = Storage.getItemSync(key);
  if (stored !== null) return normalize(key, stored);
  let legacy: string | null;
  try {
    legacy = normalize(key, await SecureStore.getItemAsync(key));
  } catch {
    // Missing Android keystore data after restore is expected.
    return Storage.getItemSync(key);
  }
  // A user may have changed the setting while the legacy read was pending.
  const current = Storage.getItemSync(key);
  if (current !== null) return normalize(key, current);
  if (legacy !== null) Storage.setItemSync(key, legacy);
  return legacy;
}

export async function setPreference(key: PreferenceKey, value: string): Promise<void> {
  Storage.setItemSync(key, normalize(key, value)!);
}
