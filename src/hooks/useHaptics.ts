import { useCallback, useEffect } from "react";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";

const HAPTICS_KEY = "haptics_enabled";

let cachedEnabled: boolean | null = null;
let settingsLoaded = false;

export function isHapticsEnabled(): boolean {
  if (!settingsLoaded) return false;
  return cachedEnabled === null ? true : cachedEnabled;
}

export async function getHapticsEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(HAPTICS_KEY);
  const enabled = stored !== "false";
  cachedEnabled = enabled;
  settingsLoaded = true;
  return enabled;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  cachedEnabled = enabled;
  settingsLoaded = true;
  await SecureStore.setItemAsync(HAPTICS_KEY, String(enabled));
}

export function useHaptics() {
  useEffect(() => {
    void getHapticsEnabled();
  }, []);
  const light = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {}
  }, []);

  const medium = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch {}
  }, []);

  const heavy = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    } catch {}
  }, []);

  const success = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  }, []);

  const warning = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {}
  }, []);

  const error = useCallback(async () => {
    try {
      if (isHapticsEnabled()) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {}
  }, []);

  return { light, medium, heavy, success, warning, error };
}
