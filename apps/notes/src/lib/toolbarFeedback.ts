import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function toolbarFeedback() {
  const feedback = Platform.OS === "android"
    ? Haptics.performAndroidHapticsAsync(
      Number(Platform.Version) >= 34 ? Haptics.AndroidHaptics.Segment_Tick : Haptics.AndroidHaptics.Clock_Tick,
    )
    : Haptics.selectionAsync();
  // Devices without a haptics engine still apply formatting immediately.
  void feedback.catch(() => {});
}
