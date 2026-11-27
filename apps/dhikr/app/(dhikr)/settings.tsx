import { actionErrorOptions } from "../../src/lib/actionErrorOptions";
import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Switch, Pressable, Linking, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Application from "expo-application";
import { toast } from "sonner-native";
import { Text } from "../../src/components/ui/Typography";
import { Button } from "../../src/components/ui/Button";
import { ChevronRight, Settings } from "../../src/components/AppIcons";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { UpdateCard } from "../../src/components/UpdateCard";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { getHapticsEnabled, setHapticsEnabled } from "../../src/hooks/useHaptics";
import { exportBackupToFile, readBackupFile, parseBackup, importBackup } from "../../src/lib/backup";

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const [haptics, setHaptics] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [pendingImport, setPendingImport] = useState<{ json: string; count: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getHapticsEnabled().then(value => { if (active) setHaptics(value); })
      .catch(() => toast.error("Failed to load data.", actionErrorOptions));
    return () => { active = false; };
  }, []));

  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      if (result !== null) toast.success(success);
      return result !== null;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const pickImport = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const json = await readBackupFile(result.assets[0].uri);
      const rows = parseBackup(json);
      setPendingImport({ json, count: rows.length });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-4 px-5 pb-4 pt-4">
          <View className="min-h-[48px] justify-center">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">Settings</Text>
          </View>
          <View className="gap-3 rounded-[24px] border border-border bg-surface px-4 pt-4">
            <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Appearance</Text>
            <View className="flex-row gap-1 rounded-[24px] border border-border bg-background p-1" accessibilityRole="radiogroup" accessibilityLabel="Appearance">
              {(["light", "dark"] as const).map(value => (
                <Pressable key={value} onPress={() => setTheme(value)}
                  className={`min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-[20px] px-2 py-1 active:opacity-70 ${theme === value ? "bg-secondary-container" : ""}`}
                  accessible accessibilityRole="radio" accessibilityState={{ checked: theme === value }}
                  accessibilityLabel={value === "light" ? "Light" : "Dark"}>
                  <Text className={`text-label-large ${theme === value ? "font-semibold text-on-secondary-container" : "font-medium text-muted-foreground"}`}>
                    {value === "light" ? "Light" : "Dark"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="min-h-[56px] flex-row items-center justify-between gap-3 border-t border-border py-2">
              <Text className="flex-1 text-[15px] font-medium text-foreground">Vibration feedback</Text>
              <Switch value={haptics} disabled={busy} accessibilityLabel="Vibration feedback"
                accessibilityState={{ disabled: busy }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={haptics ? colors.primaryForeground : colors.outline}
                onValueChange={value => {
                  if (busyRef.current) return;
                  busyRef.current = true;
                  setBusy(true);
                  void setHapticsEnabled(value).then(() => setHaptics(value))
                    .catch(() => toast.error("Failed to save.", actionErrorOptions)).finally(() => {
                      busyRef.current = false;
                      setBusy(false);
                    });
                }} />
            </View>
          </View>
          <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
            <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Backup &amp; restore</Text>
            <View className="flex-row flex-wrap gap-2">
              <Button className="min-w-[104px] flex-1" label="Export" disabled={busy}
                onPress={() => { void run(exportBackupToFile, "Backup saved"); }} />
              <Button className="min-w-[104px] flex-1" label="Import" variant="secondary" disabled={busy}
                onPress={() => { void pickImport(); }} />
            </View>
            {actionError && !pendingImport && <Text accessibilityRole="alert" className="text-sm text-destructive">{actionError}</Text>}
          </View>
          <Pressable disabled={busy} accessibilityState={{ disabled: busy }}
            className="min-h-[56px] flex-row items-center gap-3 rounded-[24px] border border-border bg-surface px-4 py-2 active:opacity-60"
            accessible accessibilityRole="button" accessibilityLabel="Manage app permissions"
            onPress={() => {
              if (busyRef.current) return;
              void Linking.openSettings().catch(() => toast.error("Could not open app settings. Open system Settings and select Dhikr.", actionErrorOptions));
            }}>
            <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <Settings size={18} color={colors.foreground} />
            </View>
            <Text className="min-w-0 flex-1 text-[15px] font-medium text-foreground">Manage app permissions</Text>
            <ChevronRight size={18} color={colors.mutedForeground} />
          </Pressable>
          {Platform.OS === "android" ? (
            <UpdateCard />
          ) : (
            <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
              <Text accessibilityRole="header" className="text-base font-semibold text-foreground">About</Text>
              <Text className="text-xs text-muted-foreground">Version: {Application.nativeApplicationVersion ?? require("../../package.json").version}</Text>
            </View>
          )}
          <Pressable accessibilityRole="link" accessibilityLabel="UIcons by Flaticon" className="min-h-[44px] justify-center self-center rounded-lg px-3 active:opacity-70"
            onPress={() => { void Linking.openURL("https://www.flaticon.com/uicons").catch(() => toast.error("Unable to open the link.", actionErrorOptions)); }}>
            <Text className="text-xs text-muted-foreground underline">UIcons by Flaticon</Text>
          </Pressable>
        </View>
      </ScrollView>
      <ConfirmDialog visible={pendingImport !== null} title="Import counts"
        message={`Import ${pendingImport?.count ?? 0} dhikrs? This replaces your current counts.`} destructive
        error={actionError}
        confirmLabel="Import counts" onClose={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return;
          if (await run(() => importBackup(pendingImport.json), "Data imported successfully")) setPendingImport(null);
        }} />
    </>
  );
}
