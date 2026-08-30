import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";

const HAPTICS_KEY = "haptics_enabled";

export async function getHapticsEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(HAPTICS_KEY);
  return stored !== "false";
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(HAPTICS_KEY, String(enabled));
}

export function useHaptics() {
  const light = useCallback(async () => {
    const enabled = await getHapticsEnabled();
    if (enabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const medium = useCallback(async () => {
    const enabled = await getHapticsEnabled();
    if (enabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const heavy = useCallback(async () => {
    const enabled = await getHapticsEnabled();
    if (enabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, []);

  const success = useCallback(async () => {
    const enabled = await getHapticsEnabled();
    if (enabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  const warning = useCallback(async () => {
    const enabled = await getHapticsEnabled();
    if (enabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, []);

  const error = useCallback(async () => {
    const enabled = await getHapticsEnabled();
    if (enabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);

  return { light, medium, heavy, success, warning, error };
}
