import { useCallback, useRef, useState, type ComponentType } from "react";
import { ScrollView, View, Switch, Pressable, Linking, Platform, BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Application from "expo-application";
import { toast } from "sonner-native";
import { Text } from "../../src/components/ui/Typography";
import { Button } from "../../src/components/ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "../../src/components/ui/AnchoredMenu";
import { ChevronLeft, ChevronRight, CircleHelp, Download, type AppIconProps } from "../../src/components/AppIcons";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { UpdateCard } from "../../src/components/UpdateCard";
import { useI18n } from "../../src/lib/i18n";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { withAlpha } from "../../src/lib/utils";
import { getHapticsEnabled, setHapticsEnabled } from "../../src/hooks/useHaptics";
import { exportBackup, exportBackupToDirectory, readBackupFile, parseBackup, importBackup, hasSafetyBackup, restoreSafetyBackup } from "../../src/lib/backup";

type SettingsSection = "backup" | "about" | null;

function SettingsRow({ icon: Icon, label, onPress }: {
  icon: ComponentType<AppIconProps>;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress}
      className="min-h-[56px] flex-row items-center gap-3 rounded-lg px-1 py-3"
      android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
      accessible accessibilityRole="button" accessibilityLabel={label}>
      <Icon size={18} color={colors.mutedForeground} />
      <Text className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{label}</Text>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const [haptics, setHaptics] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [safetyAvailable, setSafetyAvailable] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ json: string; count: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
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
      .catch(() => toast.error(t("errorLoadingData")));
    setSafetyAvailable(hasSafetyBackup());
    return () => { active = false; };
  }, [t]));

  const run = async (action: () => Promise<unknown>, success: "exportSuccess" | "backupSaved" | "importSuccess"): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await action();
      setSafetyAvailable(hasSafetyBackup());
      if (result !== null) toast.success(t(success));
      return result !== null;
    } catch (error) {
      toast.error(t("operationFailed", { reason: error instanceof Error ? error.message : String(error) }));
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
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json"], copyToCacheDirectory: true });
      if (result.canceled) return;
      const json = await readBackupFile(result.assets[0].uri);
      const rows = parseBackup(json);
      setPendingImport({ json, count: rows.length });
    } catch (error) {
      toast.error(t("operationFailed", { reason: error instanceof Error ? error.message : String(error) }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView key={section ?? "settings"} className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-5 px-4 pt-3 pb-28">
          <View className="flex-row items-center gap-2">
            {section && <Pressable disabled={busy} onPress={() => setSection(null)}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-muted"
              android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
              accessible accessibilityRole="button" accessibilityLabel={t("settingsBack")}
              accessibilityState={{ disabled: busy }}>
              <ChevronLeft size={24} color={colors.foreground} />
            </Pressable>}
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-xl font-semibold text-foreground">
              {t(section === "backup" ? "settingsBackupRestore" : section === "about" ? "settingsAboutUpdates" : "settingsTitle")}
            </Text>
          </View>
          {!section && <>
            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsAppearance")}</Text>
              <View className="rounded-2xl border border-border/60 bg-card p-3">
                <Text className="mb-2 text-sm font-medium text-foreground">{t("themeLabel")}</Text>
                <View className="flex-row rounded-xl bg-muted/60 p-1" accessibilityRole="radiogroup">
                  {(["light", "dark"] as const).map(value => (
                    <Pressable key={value} onPress={() => setTheme(value)}
                      className={`min-h-[44px] flex-1 items-center justify-center rounded-lg ${theme === value ? "bg-card" : ""}`}
                      android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                      accessible accessibilityRole="radio" accessibilityState={{ checked: theme === value }}
                      accessibilityLabel={t(value === "light" ? "themeLight" : "themeDark")}>
                      <Text className={`text-sm font-medium ${theme === value ? "text-foreground" : "text-muted-foreground"}`}>
                        {t(value === "light" ? "themeLight" : "themeDark")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsPreferences")}</Text>
              <View className="min-h-[56px] flex-row items-center justify-between rounded-2xl border border-border/60 bg-card px-3 py-2">
                <Text className="flex-1 text-[15px] font-medium text-foreground">{t("hapticsLabel")}</Text>
                <Switch value={haptics} disabled={busy} accessibilityLabel={t("hapticsLabel")}
                  accessibilityState={{ disabled: busy }}
                  trackColor={{ false: colors.muted, true: colors.primary }}
                  thumbColor={theme === "dark" ? colors.foreground : colors.card}
                  onValueChange={value => {
                    if (busyRef.current) return;
                    busyRef.current = true;
                    setBusy(true);
                    void setHapticsEnabled(value).then(() => setHaptics(value))
                      .catch(() => toast.error(t("saveFailed"))).finally(() => {
                        busyRef.current = false;
                        setBusy(false);
                      });
                  }} />
              </View>
            </View>
            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsData")}</Text>
              <View className="rounded-2xl border border-border/60 bg-card px-3">
                <SettingsRow icon={Download} label={t("settingsBackupRestore")} onPress={() => setSection("backup")} />
              </View>
            </View>
            <View className="gap-2">
              <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsHelp")}</Text>
              <View className="rounded-2xl border border-border/60 bg-card px-3">
                <SettingsRow icon={CircleHelp} label={t("settingsAboutUpdates")} onPress={() => setSection("about")} />
              </View>
            </View>
          </>}
          {section === "backup" && <View className="gap-3">
            <Text className="text-sm leading-6 text-muted-foreground">{t("backupHelp")}</Text>
            <View className="gap-3 rounded-2xl border border-border/60 bg-card p-3">
              <View ref={triggerRef} collapsable={false}>
                <Button icon={Download} disabled={busy} accessibilityState={{ expanded: anchor !== null }}
                  onPress={() => {
                    if (busyRef.current) return;
                    if (Platform.OS === "android") openExportMenu();
                    else void run(exportBackup, "exportSuccess");
                  }} label={t("exportData")} />
              </View>
              <Button variant="secondary" disabled={busy} onPress={() => { void pickImport(); }} label={t("importData")} />
              {safetyAvailable && <Button variant="secondary" disabled={busy} onPress={() => setRestoring(true)} label={t("restoreSafetyBackup")} />}
            </View>
          </View>}
          {section === "about" && <>
            <UpdateCard />
            <View className="items-center gap-1 pt-2">
              <Text className="text-xs text-muted-foreground">{t("version")}: {Application.nativeApplicationVersion ?? require("../../package.json").version}</Text>
              <Pressable accessibilityRole="link" accessibilityLabel={t("flaticonAttribution")} className="min-h-[44px] justify-center rounded-lg px-3 active:opacity-70"
                onPress={() => { void Linking.openURL("https://www.flaticon.com/uicons").catch(() => toast.error(t("linkOpenFailed"))); }}>
                <Text className="text-xs text-muted-foreground underline">{t("flaticonAttribution")}</Text>
              </Pressable>
            </View>
          </>}
        </View>
      </ScrollView>
      <AnchoredMenu anchor={anchor} onClose={closeExportMenu} size="regular" align="start"
        items={[
          { key: "folder", label: t("saveBackupToFolder"), icon: Download,
            onPress: () => { void run(exportBackupToDirectory, "backupSaved"); } },
          { key: "share", label: t("shareBackup"),
            onPress: () => { void run(exportBackup, "exportSuccess"); } },
        ]} />
      <ConfirmDialog visible={pendingImport !== null} title={t("importData")}
        message={t("importDhikrConfirm", { count: pendingImport?.count ?? 0 })} destructive
        confirmLabel={t("importData")} onClose={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return;
          if (await run(() => importBackup(pendingImport.json), "importSuccess")) setPendingImport(null);
        }} />
      <ConfirmDialog visible={restoring} title={t("restoreSafetyBackup")}
        message={t("restoreConfirm")} destructive onClose={() => setRestoring(false)}
        onConfirm={async () => {
          if (await run(restoreSafetyBackup, "importSuccess")) setRestoring(false);
        }} />
    </>
  );
}
