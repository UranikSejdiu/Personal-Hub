import { actionErrorOptions } from "../lib/actionErrorOptions";
import { useCallback, useRef, useState } from "react";
import { BackHandler, Linking, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { toast } from "sonner-native";
import { Text } from "./ui/Typography";
import { Button } from "./ui/Button";
import { ChevronRight, Settings } from "./AppIcons";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateCard } from "./UpdateCard";
import { useTheme, useThemeColors } from "../lib/theme";
import { exportBackupToFile, importBackup, previewBackup, readBackupFile } from "../lib/backup";
import identity from "../appIdentity.json";
import { ReminderSetup } from "./tasks/ReminderSetup";

export default function SettingsScreen(_props: { activeAppId?: string }) {
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [pending, setPending] = useState<{ json: string; summary: string } | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => locked.current);
    return () => listener.remove();
  }, []));

  const run = async (action: () => Promise<unknown>, message?: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      if (result !== null && message) toast.success(message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally { locked.current = false; setBusy(false); }
  };
  const pick = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled) return null;
    const json = await readBackupFile(result.assets[0].uri);
    setPending({ json, summary: previewBackup(json) });
  });
  const confirmImport = () => run(async () => {
    if (!pending) return;
    const result = await importBackup(pending.json);
    setPending(null);
    setReceipt(pending.summary);
    if (result.preferences?.theme && result.preferencesRestored) setTheme(result.preferences.theme);
    toast.success(result.preferencesRestored ? "Import complete. Your original Hub data is unchanged." : "Records imported. Some appearance settings could not be restored.");
  });

  return <>
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pb-6">
      <View className="w-full max-w-md self-center gap-4 px-5 pt-4">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">Settings</Text>
        <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Appearance</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" className="flex-row gap-1 rounded-[24px] border border-border bg-background p-1">
            {(["light", "dark"] as const).map(value => {
              const selected = theme === value;
              return <Pressable key={value} disabled={busy} onPress={() => setTheme(value)}
                accessibilityRole="radio" accessibilityLabel={value === "light" ? "Light" : "Dark"}
                accessibilityState={{ checked: selected, disabled: busy }}
                className={`min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-[20px] px-3 py-2 active:opacity-70 ${selected ? "bg-secondary-container" : ""} ${busy ? "opacity-60" : ""}`}>
                <Text className={`text-center text-label-large ${selected ? "font-semibold text-on-secondary-container" : "font-medium text-muted-foreground"}`}>{value === "light" ? "Light" : "Dark"}</Text>
              </Pressable>;
            })}
          </View>
        </View>
        <ReminderSetup />
        <Pressable accessibilityRole="button" accessibilityLabel="Manage app permissions" accessibilityState={{ disabled: busy }}
          disabled={busy} className="min-h-[56px] flex-row items-center gap-3 rounded-[24px] border border-border bg-surface px-4 py-2 active:opacity-70 disabled:opacity-60"
          onPress={() => {
            if (locked.current) return;
            void Linking.openSettings().catch(() => toast.error("Could not open app settings. Open system Settings and select Tasks.", actionErrorOptions));
          }}>
          <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-container-high">
            <Settings size={18} color={colors.foreground} />
          </View>
          <Text className="min-w-0 flex-1 text-base font-semibold text-foreground">Manage app permissions</Text>
          <ChevronRight size={16} color={colors.mutedForeground} />
        </Pressable>
        <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Backup & restore</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button className="min-w-[104px] flex-1" label="Export" disabled={busy} onPress={() => void run(exportBackupToFile, "Backup saved")} />
            <Button className="min-w-[104px] flex-1" label="Import" variant="secondary" disabled={busy} onPress={() => void pick()} />
          </View>
          {receipt && <Text accessibilityRole="alert" className="text-sm text-foreground">Imported records: {receipt}.</Text>}
          {actionError && !pending && <Text accessibilityRole="alert" className="text-sm text-destructive">{actionError}</Text>}
        </View>
        <UpdateCard />
      </View>
    </ScrollView>
    <ConfirmDialog visible={pending !== null} title={`Import ${identity.title} data?`} message={`${pending?.summary ?? ""}\nThis replaces the current records in ${identity.title}.`} error={actionError} confirmLabel="Import" cancelLabel="Cancel" destructive onClose={() => { if (!locked.current) setPending(null); }} onConfirm={confirmImport} />
  </>;
}
