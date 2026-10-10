import { useCallback, useEffect, useMemo } from "react";
import * as Haptics from "expo-haptics";
import { getPreference, setPreference } from "../lib/preferences";

const HAPTICS_KEY = "haptics_enabled";

let cachedEnabled: boolean | null = null;
let settingsLoaded = false;

export function isHapticsEnabled(): boolean {
  // Default to enabled until the stored preference is read, so haptics that
  // fire during the initial load window are not silently dropped.
  if (!settingsLoaded) return true;
  return cachedEnabled === null ? true : cachedEnabled;
}

export async function getHapticsEnabled(): Promise<boolean> {
  const stored = await getPreference(HAPTICS_KEY);
  const enabled = stored !== "false";
  cachedEnabled = enabled;
  settingsLoaded = true;
  return enabled;
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
      if (isHapticsEnabled()) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  const medium = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  const success = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      // Native haptics can be unavailable on simulators and unsupported devices.
    }
  }, []);

  const warning = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
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
