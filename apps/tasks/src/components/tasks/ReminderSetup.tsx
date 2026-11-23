import { useCallback, useRef, useState } from "react";
import { AppState, Platform, Switch, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { getReminderAccess, openReminderSettings, type ReminderAccess } from "../../lib/reminderAccess";
import { openTaskReminderChannelSettings, requestTaskReminderPermission, syncTaskReminders, taskReminderNotificationsEnabled } from "../../lib/taskReminders";
import { useThemeColors } from "../../lib/theme";
import { Button } from "../ui/Button";
import { Text } from "../ui/Typography";

export function ReminderSetup() {
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
  const change = async (kind: "alarms" | "notifications" | "battery" | "channel", enabled = false) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      if (kind === "channel") {
        await openTaskReminderChannelSettings("Task reminders");
      } else if (kind === "notifications" && enabled && await requestTaskReminderPermission("Task reminders") === "granted" && await taskReminderNotificationsEnabled()) {
        await refresh();
        await syncTaskReminders("Task reminders");
      } else await openReminderSettings(kind);
    } catch {
      if (focused.current) toast.error("Couldn’t update reminder settings.");
    } finally {
      await refresh();
      operation.current = false;
      if (focused.current) setBusy(false);
    }
  };
  const options = [
    { kind: "notifications", label: "Notifications", enabled: status.notifications === true, available: status.notifications !== null },
    { kind: "alarms", label: "On-time reminders", enabled: status.access?.exactAlarms ?? false, available: status.access !== null && Number(Platform.Version) >= 31 },
    { kind: "battery", label: "Unrestricted battery", enabled: status.access?.batteryUnrestricted ?? false, available: status.access !== null },
  ] as const;
  return <View className="gap-2 rounded-xl border border-border bg-card p-3">
    <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">Reminder delivery</Text>
    <View>
      {options.map((option, index) => <View key={option.kind} className={`min-h-[52px] flex-row items-center justify-between gap-3 ${index < options.length - 1 ? "border-b border-border/60" : ""}`}>
        <Text className="flex-1 text-sm text-foreground">{option.label}</Text>
        <Switch value={option.enabled} disabled={busy || !option.available} hitSlop={9}
          onValueChange={enabled => { void change(option.kind, enabled); }}
          accessibilityLabel={option.label} accessibilityHint="Changes may open Android settings."
          accessibilityState={{ checked: option.enabled, disabled: busy || !option.available, busy }}
          trackColor={{ false: colors.input, true: colors.primary }} thumbColor={option.enabled ? colors.primaryForeground : colors.mutedForeground} />
      </View>)}
    </View>
    {status.notifications !== null && Number(Platform.Version) >= 26 && (
      <Button label="Reminder sound & vibration" variant="secondary" disabled={busy} onPress={() => { void change("channel"); }} />
    )}
    <Text className="text-xs text-muted-foreground">{status.notifications === null || !status.access ? "Reminder settings need a native build." : "Changes may open Android settings."}</Text>
  </View>;
}
