import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";

export type ReminderAccess = { exactAlarms: boolean; batteryUnrestricted: boolean };

export function getReminderAccess(): ReminderAccess | null {
  if (Platform.OS !== "android" || isRunningInExpoGo()) return null;
  return requireOptionalNativeModule<{ getStatus(): ReminderAccess }>("ReminderAccess")?.getStatus() ?? null;
}

export async function openReminderSettings(kind: "alarms" | "notifications" | "battery"): Promise<void> {
  const packageName = Application.applicationId;
  if (Platform.OS !== "android" || !packageName) return Linking.openSettings();
  try {
    if (kind === "alarms" && Number(Platform.Version) >= 31) {
      await IntentLauncher.startActivityAsync("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", { data: `package:${packageName}` });
    } else if (kind === "notifications") {
      await IntentLauncher.startActivityAsync("android.settings.APP_NOTIFICATION_SETTINGS", { extra: { "android.provider.extra.APP_PACKAGE": packageName } });
    } else {
      await Linking.openSettings();
    }
  } catch {
    await Linking.openSettings();
  }
}
