import { useCallback, useEffect, useMemo } from "react";
import * as Haptics from "expo-haptics";
import { getPreference, setPreference } from "../lib/preferences";

const HAPTICS_KEY = "haptics_enabled";

let cachedEnabled: boolean | null = null;
let settingsLoaded = false;
let loading: Promise<boolean> | null = null;
const lastFeedback = new Map<string, number>();

function shouldVibrate(kind: string, interval: number): boolean {
  if (!isHapticsEnabled()) return false;
  const now = Date.now();
  const last = lastFeedback.get(kind);
  if (last !== undefined && now >= last && now - last < interval) return false;
  lastFeedback.set(kind, now);
  return true;
}

export function isHapticsEnabled(): boolean {
  // Default to enabled until the stored preference is read, so haptics that
  // fire during the initial load window are not silently dropped.
  if (!settingsLoaded) return true;
  return cachedEnabled === null ? true : cachedEnabled;
}

export async function getHapticsEnabled(): Promise<boolean> {
  if (settingsLoaded) return isHapticsEnabled();
  if (loading) return loading;
  loading = (async () => {
    const stored = await getPreference(HAPTICS_KEY);
    // A settings change may have finished while this read was pending.
    if (!settingsLoaded) {
      cachedEnabled = stored !== "false";
      settingsLoaded = true;
    }
    return isHapticsEnabled();
  })();
  try { return await loading; } finally { loading = null; }
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  await setPreference(HAPTICS_KEY, String(enabled));
  cachedEnabled = enabled;
  settingsLoaded = true;
}

export function useHaptics() {
  useEffect(() => {
    if (settingsLoaded) return;
    void getHapticsEnabled().catch(() => {
      // Leave settingsLoaded false so a later mount retries; controls stay
      // enabled by default in the meantime.
    });
  }, []);
  const light = useCallback(async () => {
    try {
      if (shouldVibrate("light", 70)) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  const medium = useCallback(async () => {
    try {
      if (shouldVibrate("medium", 70)) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  const success = useCallback(async () => {
    try {
      if (shouldVibrate("success", 250)) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  const warning = useCallback(async () => {
    try {
      if (shouldVibrate("warning", 500)) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  // Stable object identity: all callbacks are `useCallback([])`-stable, so
  // consumers that list `haptics` in their dependency arrays do not re-create
  // callbacks (and re-render memoized children) on every render.
  return useMemo(
    () => ({ light, medium, success, warning }),
    [light, medium, success, warning]
  );
}
