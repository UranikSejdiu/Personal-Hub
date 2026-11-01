import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function toolbarFeedback() {
  const feedback = Platform.OS === "android"
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    : Haptics.selectionAsync();
  // Devices without a haptics engine still apply formatting immediately.
  void feedback.catch(() => {});
}
