import { useCallback, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../lib/i18n";
import { getReminderAccess, openReminderSettings, type ReminderAccess } from "../../lib/reminderAccess";
import { requestTaskReminderPermission, syncTaskReminders, taskReminderNotificationsEnabled } from "../../lib/taskReminders";
import { Text } from "../ui/Typography";
import { Button } from "../ui/Button";

export function ReminderSetup() {
  const { t } = useI18n();
  const [status, setStatus] = useState<{ access: ReminderAccess | null; notifications: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = async () => {
      try {
        const notifications = await taskReminderNotificationsEnabled();
        const access = getReminderAccess();
        if (active) setStatus({ access, notifications });
      } catch {
        if (active) setStatus(null);
      }
    };
    void refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { active = false; listener.remove(); };
  }, []));
  if (Platform.OS !== "android" || !status) return null;
  const open = async (kind: "alarms" | "notifications" | "battery") => {
    if (busy) return;
    setBusy(true);
    try {
      if (kind === "notifications" && await requestTaskReminderPermission(t("tasksReminderChannel")) === "granted" && await taskReminderNotificationsEnabled()) {
        setStatus({ access: getReminderAccess(), notifications: true });
        await syncTaskReminders(t("tasksReminderChannel"));
      } else await openReminderSettings(kind);
    } catch {
      toast.error(t("tasksReminderFailed"));
    } finally { setBusy(false); }
  };
  return <View className="gap-2 rounded-xl border border-border bg-card p-3">
    <Text className="text-sm font-semibold text-foreground">{t("tasksReminderSetup")}</Text>
    {status.notifications === null ? <Text className="text-xs text-muted-foreground">{t("tasksReminderBuild")}</Text> : <>
      {!status.notifications && <Button variant="secondary" disabled={busy} label={t("tasksEnableNotifications")} onPress={() => void open("notifications")} />}
      {status.access && !status.access.exactAlarms && <>
        <Text className="text-xs text-muted-foreground">{t("tasksExactAlarmHint")}</Text>
        <Button variant="secondary" disabled={busy} label={t("tasksEnableExactAlarms")} onPress={() => void open("alarms")} />
      </>}
      {!status.access && <Text className="text-xs text-muted-foreground">{t("tasksReminderBuild")}</Text>}
      {status.access && !status.access.batteryUnrestricted && <>
        <Text className="text-xs text-muted-foreground">{t("tasksBatteryHint")}</Text>
        <Button variant="secondary" disabled={busy} label={t("tasksBatterySettings")} onPress={() => void open("battery")} />
      </>}
      {status.notifications && status.access?.exactAlarms && <Text className="text-xs text-muted-foreground">{t("tasksReminderReady")}</Text>}
    </>}
  </View>;
}
