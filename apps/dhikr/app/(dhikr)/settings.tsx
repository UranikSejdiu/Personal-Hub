import { useCallback, useRef, useState, type ComponentType } from "react";
import { ScrollView, View, Switch, Pressable, Linking, Platform, BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Application from "expo-application";
import { toast } from "sonner-native";
import { Text } from "../../src/components/ui/Typography";
import { Button } from "../../src/components/ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "../../src/components/ui/AnchoredMenu";
import { ChevronLeft, ChevronRight, Settings, CircleHelp, Download, type AppIconProps } from "../../src/components/AppIcons";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { UpdateCard } from "../../src/components/UpdateCard";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { withAlpha } from "../../src/lib/utils";
import { getHapticsEnabled, setHapticsEnabled } from "../../src/hooks/useHaptics";
import { exportBackup, exportBackupToDirectory, readBackupFile, parseBackup, importBackup, hasSafetyBackup, restoreSafetyBackup } from "../../src/lib/backup";

type SettingsSection = "backup" | "about" | null;

function SettingsRow({ icon: Icon, label, onPress, disabled = false }: {
  icon: ComponentType<AppIconProps>;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityState={{ disabled }}
      className="min-h-[48px] flex-row items-center gap-2 rounded-lg px-1 py-2"
      android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
      accessible accessibilityRole="button" accessibilityLabel={label}>
      <Icon size={18} color={colors.mutedForeground} />
      <Text className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{label}</Text>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const [haptics, setHaptics] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [safetyAvailable, setSafetyAvailable] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ json: string; count: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>(null);
  const { triggerRef, anchor, open: openExportMenu, close: closeExportMenu } = useAnchoredMenu();

  useFocusEffect(useCallback(() => {
    if (!section) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busyRef.current) setSection(null);
      return true;
    });
    return () => subscription.remove();
  }, [section]));

  useFocusEffect(useCallback(() => {
    let active = true;
    void getHapticsEnabled().then(value => { if (active) setHaptics(value); })
      .catch(() => toast.error("Failed to load data."));
    setSafetyAvailable(hasSafetyBackup());
    return () => { active = false; };
  }, []));

  const run = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      setSafetyAvailable(hasSafetyBackup());
      if (result !== null) toast.success(success);
      return result !== null;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setSafetyAvailable(hasSafetyBackup());
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
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json"], copyToCacheDirectory: true });
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
      <ScrollView key={section ?? "settings"} className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-3 px-4 pt-1 pb-4">
          <View className="min-h-[48px] flex-row items-center gap-2">
            {section && <Pressable disabled={busy} onPress={() => setSection(null)}
              className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
              android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
              accessible accessibilityRole="button" accessibilityLabel="Back to Settings"
              accessibilityState={{ disabled: busy }}>
              <ChevronLeft size={20} color={colors.foreground} />
            </Pressable>}
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-medium text-foreground">
              {section === "backup" ? "Backup & restore" : section === "about" ? "About & updates" : "Settings"}
            </Text>
          </View>
          {!section && <>
            <View className="gap-2">
              <Text accessibilityRole="header" className="px-1 text-sm font-semibold text-foreground">Appearance</Text>
              <View className="rounded-xl border border-border/60 bg-card p-3">
                <View className="flex-row rounded-full border border-outline" accessibilityRole="radiogroup" accessibilityLabel="Appearance">
                  {(["light", "dark"] as const).map(value => (
                    <Pressable key={value} onPress={() => setTheme(value)}
                      className={`min-h-[48px] min-w-0 flex-1 items-center justify-center px-2 py-1 ${value === "light" ? "rounded-l-full border-r border-outline" : "rounded-r-full"} ${theme === value ? "bg-secondary-container" : ""}`}
                      android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                      accessible accessibilityRole="radio" accessibilityState={{ checked: theme === value }}
                      accessibilityLabel={value === "light" ? "Light" : "Dark"}>
                      <Text className={`text-label-large font-medium ${theme === value ? "text-on-secondary-container" : "text-muted-foreground"}`}>
                        {value === "light" ? "Light" : "Dark"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <View className="min-h-[52px] flex-row items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
              <Text className="flex-1 text-[15px] font-medium text-foreground">Vibration feedback</Text>
              <Switch value={haptics} disabled={busy} accessibilityLabel="Vibration feedback"
                accessibilityState={{ disabled: busy }}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={theme === "dark" ? colors.foreground : colors.card}
                onValueChange={value => {
                  if (busyRef.current) return;
                  busyRef.current = true;
                  setBusy(true);
                  void setHapticsEnabled(value).then(() => setHaptics(value))
                    .catch(() => toast.error("Failed to save.")).finally(() => {
                      busyRef.current = false;
                      setBusy(false);
                    });
                }} />
            </View>
            <View className="rounded-xl border border-border/60 bg-card px-3">
              <SettingsRow icon={Download} label="Backup & restore" onPress={() => setSection("backup")} />
              <SettingsRow icon={Settings} label="Manage app permissions" disabled={busy} onPress={() => {
                if (busyRef.current) return;
                void Linking.openSettings().catch(() => toast.error("Could not open app settings. Open system Settings and select Dhikr."));
              }} />
              <SettingsRow icon={CircleHelp} label="About & updates" onPress={() => setSection("about")} />
            </View>
          </>}
          {section === "backup" && <View className="gap-3">
            <View className="gap-3 rounded-2xl border border-border/60 bg-card p-3">
              <View ref={triggerRef} collapsable={false}>
                <Button icon={Download} disabled={busy} accessibilityState={{ expanded: anchor !== null }}
                  onPress={() => {
                    if (busyRef.current) return;
                    if (Platform.OS === "android") openExportMenu();
                    else void run(exportBackup, "Data exported successfully");
                  }} label="Export backup" />
              </View>
              <Button variant="secondary" disabled={busy} onPress={() => { void pickImport(); }} label="Import counts" />
              {actionError && !pendingImport && !restoring && <Text accessibilityRole="alert" className="text-sm text-destructive">{actionError}</Text>}
              {safetyAvailable && <Button variant="secondary" disabled={busy} onPress={() => {
                setActionError(null);
                setRestoring(true);
              }} label="Restore previous data" />}
            </View>
          </View>}
          {section === "about" && <>
            <UpdateCard />
            <View className="items-center gap-1 pt-2">
              <Text className="text-xs text-muted-foreground">Version: {Application.nativeApplicationVersion ?? require("../../package.json").version}</Text>
              <Pressable accessibilityRole="link" accessibilityLabel="UIcons by Flaticon" className="min-h-[44px] justify-center rounded-lg px-3 active:opacity-70"
                onPress={() => { void Linking.openURL("https://www.flaticon.com/uicons").catch(() => toast.error("Unable to open the link.")); }}>
                <Text className="text-xs text-muted-foreground underline">UIcons by Flaticon</Text>
              </Pressable>
            </View>
          </>}
        </View>
      </ScrollView>
      <AnchoredMenu anchor={anchor} onClose={closeExportMenu} size="regular" align="start"
        items={[
          { key: "folder", label: "Save to folder", icon: Download,
            onPress: () => { void run(exportBackupToDirectory, "Backup saved to the selected folder"); } },
          { key: "share", label: "Share backup",
            onPress: () => { void run(exportBackup, "Data exported successfully"); } },
        ]} />
      <ConfirmDialog visible={pendingImport !== null} title="Import counts"
        message={`Import ${pendingImport?.count ?? 0} dhikrs? This replaces your current counts. A recovery copy of your current data will be saved first.`} destructive
        error={actionError}
        confirmLabel="Import counts" onClose={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return;
          if (await run(() => importBackup(pendingImport.json), "Data imported successfully")) setPendingImport(null);
        }} />
      <ConfirmDialog visible={restoring} title="Restore previous data"
        message="Replace your current counts with the recovery copy from before your last import?" error={actionError} destructive onClose={() => setRestoring(false)}
        onConfirm={async () => {
          if (await run(restoreSafetyBackup, "Data imported successfully")) setRestoring(false);
        }} />
    </>
  );
}
