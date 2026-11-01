import { useCallback, useRef, useState } from "react";
import { AppState, Platform, Switch, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../lib/i18n";
import { getReminderAccess, openReminderSettings, type ReminderAccess } from "../../lib/reminderAccess";
import { requestTaskReminderPermission, syncTaskReminders, taskReminderNotificationsEnabled } from "../../lib/taskReminders";
import { useThemeColors } from "../../lib/theme";
import { Text } from "../ui/Typography";

export function ReminderSetup() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [status, setStatus] = useState<{ access: ReminderAccess | null; notifications: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const focused = useRef(false);
  const operation = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const notifications = await taskReminderNotificationsEnabled();
      const access = getReminderAccess();
      if (focused.current && request === sequence.current) setStatus({ access, notifications });
    } catch {
      if (focused.current && request === sequence.current) setStatus(null);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(operation.current);
    void refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { focused.current = false; ++sequence.current; listener.remove(); };
  }, [refresh]));
  if (Platform.OS !== "android" || !status) return null;
  const change = async (kind: "alarms" | "notifications" | "battery", enabled: boolean) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      if (kind === "notifications" && enabled && await requestTaskReminderPermission(t("tasksReminderChannel")) === "granted" && await taskReminderNotificationsEnabled()) {
        await refresh();
        await syncTaskReminders(t("tasksReminderChannel"));
      } else await openReminderSettings(kind);
    } catch {
      if (focused.current) toast.error(t("tasksReminderSettingsFailed"));
    } finally {
      await refresh();
      operation.current = false;
      if (focused.current) setBusy(false);
    }
  };
  const options = [
    { kind: "notifications", label: t("tasksReminderNotifications"), enabled: status.notifications === true, available: status.notifications !== null },
    { kind: "alarms", label: t("tasksReminderExactAlarms"), enabled: status.access?.exactAlarms ?? false, available: status.access !== null && Number(Platform.Version) >= 31 },
    { kind: "battery", label: t("tasksReminderBattery"), enabled: status.access?.batteryUnrestricted ?? false, available: status.access !== null },
  ] as const;
  return <View className="gap-2 rounded-xl border border-border bg-card p-3">
    <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">{t("tasksReminderSetup")}</Text>
    <View>
      {options.map((option, index) => <View key={option.kind} className={`min-h-[52px] flex-row items-center justify-between gap-3 ${index < options.length - 1 ? "border-b border-border/60" : ""}`}>
        <Text className="flex-1 text-sm text-foreground">{option.label}</Text>
        <Switch value={option.enabled} disabled={busy || !option.available} hitSlop={9}
          onValueChange={enabled => { void change(option.kind, enabled); }}
          accessibilityLabel={option.label} accessibilityHint={t("tasksReminderSystemSettings")}
          accessibilityState={{ checked: option.enabled, disabled: busy || !option.available, busy }}
          trackColor={{ false: colors.input, true: colors.primary }} thumbColor={option.enabled ? colors.primaryForeground : colors.mutedForeground} />
      </View>)}
    </View>
    <Text className="text-xs text-muted-foreground">{t(status.notifications === null || !status.access ? "tasksReminderSetupUnavailable" : "tasksReminderSystemSettings")}</Text>
  </View>;
}
