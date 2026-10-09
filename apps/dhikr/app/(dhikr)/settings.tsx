import { useCallback, useRef, useState } from "react";
import { ScrollView, View, Switch, Pressable, Linking, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Application from "expo-application";
import { toast } from "sonner-native";
import { Text } from "../../src/components/ui/Typography";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { UpdateCard } from "../../src/components/UpdateCard";
import { useI18n } from "../../src/lib/i18n";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { getHapticsEnabled, setHapticsEnabled } from "../../src/hooks/useHaptics";
import { exportBackup, exportBackupToDirectory, readBackupFile, parseBackup, importBackup, hasSafetyBackup, restoreSafetyBackup } from "../../src/lib/backup";

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

  useFocusEffect(useCallback(() => {
    let active = true;
    void getHapticsEnabled().then(value => { if (active) setHaptics(value); })
      .catch(() => toast.error(t("errorLoadingData")));
    setSafetyAvailable(hasSafetyBackup());
    return () => { active = false; };
  }, [t]));

  const run = async (action: () => Promise<unknown>, success: "exportSuccess" | "backupSaved" | "importSuccess") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await action();
      setSafetyAvailable(hasSafetyBackup());
      if (result !== null) toast.success(t(success));
    } catch (error) {
      toast.error(t("operationFailed", { reason: error instanceof Error ? error.message : String(error) }));
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
      <ScrollView className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-4 px-4 pt-3 pb-32">
          <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{t("settingsTitle")}</Text>
          <Card className="gap-3 p-4">
            <Text className="text-base font-semibold text-foreground">{t("themeLabel")}</Text>
            <View className="flex-row gap-3">
              <Button variant={theme === "light" ? "primary" : "secondary"} onPress={() => setTheme("light")} label={t("themeLight")} />
              <Button variant={theme === "dark" ? "primary" : "secondary"} onPress={() => setTheme("dark")} label={t("themeDark")} />
            </View>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-base text-foreground">{t("hapticsLabel")}</Text>
              <Switch value={haptics} disabled={busy} accessibilityLabel={t("hapticsLabel")}
                trackColor={{ false: colors.border, true: colors.primary }}
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
          </Card>
          <Card className="gap-3 p-4">
            <Text className="text-base font-semibold text-foreground">{t("settingsBackupRestore")}</Text>
            <Text className="text-sm leading-6 text-muted-foreground">{t("backupHelp")}</Text>
            <Button disabled={busy} onPress={() => {
              void run(Platform.OS === "android" ? exportBackupToDirectory : exportBackup, Platform.OS === "android" ? "backupSaved" : "exportSuccess");
            }} label={t(Platform.OS === "android" ? "saveBackupToFolder" : "exportData")} />
            {Platform.OS === "android" && <Button variant="secondary" disabled={busy}
              onPress={() => { void run(exportBackup, "exportSuccess"); }} label={t("shareBackup")} />}
            <Button variant="secondary" disabled={busy} onPress={() => { void pickImport(); }} label={t("importData")} />
            {safetyAvailable && <Button variant="secondary" disabled={busy} onPress={() => setRestoring(true)} label={t("restoreSafetyBackup")} />}
          </Card>
          <UpdateCard />
          <View className="items-center gap-1 pt-2">
            <Text className="text-xs text-muted-foreground">{t("version")}: {Application.nativeApplicationVersion ?? "1.0.0"}</Text>
            <Pressable accessibilityRole="link" accessibilityLabel={t("flaticonAttribution")} className="min-h-[44px] justify-center rounded-lg px-3 active:opacity-70"
              onPress={() => { void Linking.openURL("https://www.flaticon.com/uicons").catch(() => toast.error(t("linkOpenFailed"))); }}>
              <Text className="text-xs text-muted-foreground underline">{t("flaticonAttribution")}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <ConfirmDialog visible={pendingImport !== null} title={t("importData")}
        message={t("importDhikrConfirm", { count: pendingImport?.count ?? 0 })} destructive
        confirmLabel={t("importData")} onClose={() => setPendingImport(null)}
        onConfirm={async () => {
          if (!pendingImport) return;
          await run(() => importBackup(pendingImport.json), "importSuccess");
          setPendingImport(null);
        }} />
      <ConfirmDialog visible={restoring} title={t("restoreSafetyBackup")}
        message={t("restoreConfirm")} destructive onClose={() => setRestoring(false)}
        onConfirm={async () => {
          await run(restoreSafetyBackup, "importSuccess");
          setRestoring(false);
        }} />
    </>
  );
}
