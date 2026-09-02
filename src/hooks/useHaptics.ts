import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";

const HAPTICS_KEY = "haptics_enabled";

let cachedEnabled: boolean | null = null;

export function isHapticsEnabled(): boolean {
  return cachedEnabled === null ? true : cachedEnabled;
}

export async function getHapticsEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(HAPTICS_KEY);
  const enabled = stored !== "false";
  cachedEnabled = enabled;
  return enabled;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  cachedEnabled = enabled;
  await SecureStore.setItemAsync(HAPTICS_KEY, String(enabled));
}

export function useHaptics() {
  const light = useCallback(async () => {
    if (isHapticsEnabled()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const medium = useCallback(async () => {
    if (isHapticsEnabled()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const heavy = useCallback(async () => {
    if (isHapticsEnabled()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, []);

  const success = useCallback(async () => {
    if (isHapticsEnabled()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const warning = useCallback(async () => {
    if (isHapticsEnabled()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, []);

  const error = useCallback(async () => {
    if (isHapticsEnabled()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  return { light, medium, heavy, success, warning, error };
}
