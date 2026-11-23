import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";

export type ReminderAccess = { exactAlarms: boolean; batteryUnrestricted: boolean; backgroundRestricted?: boolean };

export function getReminderAccess(): ReminderAccess | null {
  if (Platform.OS !== "android" || isRunningInExpoGo()) return null;
  return requireOptionalNativeModule<{ getStatus(): ReminderAccess }>("ReminderAccess")?.getStatus() ?? null;
}

export async function openReminderSettings(kind: "alarms" | "notifications" | "battery", channelId?: string): Promise<void> {
  const packageName = Application.applicationId;
  if (Platform.OS !== "android" || !packageName) return Linking.openSettings();
  try {
    if (kind === "alarms" && Number(Platform.Version) >= 31) {
      await IntentLauncher.startActivityAsync("android.settings.REQUEST_SCHEDULE_EXACT_ALARM", { data: `package:${packageName}` });
    } else if (kind === "notifications" && Number(Platform.Version) >= 26) {
      const extra = { "android.provider.extra.APP_PACKAGE": packageName };
      if (channelId) {
        await IntentLauncher.startActivityAsync("android.settings.CHANNEL_NOTIFICATION_SETTINGS", {
          extra: { ...extra, "android.provider.extra.CHANNEL_ID": channelId },
        });
      } else {
        await IntentLauncher.startActivityAsync("android.settings.APP_NOTIFICATION_SETTINGS", { extra });
      }
    } else {
      await Linking.openSettings();
    }
  } catch {
    await Linking.openSettings();
  }
}
