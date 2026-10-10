import { Text } from "./ui/Typography";
import { useState, useEffect, useCallback, useRef } from "react";
import { View, ScrollView, Pressable, BackHandler, Image, Platform } from "react-native";
import { Cloud, Download, RotateCcw, Trash2 } from "./AppIcons";
import { useRouter, type Href } from "expo-router";
import * as Linking from "expo-linking";
import { useI18n } from "../lib/i18n";
import { useTheme, useThemeColors } from "../lib/theme";
import { useHaptics, getHapticsEnabled, setHapticsEnabled, isHapticsEnabled } from "../hooks/useHaptics";
import { getAppVersion } from "../constants/config";
import { UpdateCard } from "./UpdateCard";
import {
  exportAndShareBackup,
  exportBackupToDirectory,
  importBackupFromJson,
  hasSafetyBackup,
  restoreSafetyBackup,
  readJsonFromFileUri,
  previewBackupFromJson,
} from "../lib/backup";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "sonner-native";
import * as DocumentPicker from "expo-document-picker";
import { withAlpha } from "../lib/utils";
import { getHubRoute } from "../hub/registry";
import { toggleEnabledModule, useModulePreferences } from "../hub/ModulePreferences";
import { setTutorialSeen } from "../lib/tutorial";
import { clearSampleData, hasSampleData } from "../lib/sampleData";
import { resetPlainTextBackfill } from "../lib/notes";
import { SettingsMenu, type SettingsSection } from "./SettingsMenu";
import { FormDialog } from "./ui/FormDialog";
import { ActionDialog } from "./ui/ActionDialog";
import { Button } from "./ui/Button";
import { ModuleChooser } from "./ModuleChooser";

type Section = SettingsSection | null;

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface SettingsScreenProps {
  activeAppId: string;
  section?: SettingsSection;
}

export default function SettingsScreen({ activeAppId, section }: SettingsScreenProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const { enabledIds, saveEnabledIds } = useModulePreferences();
  const activeSection: Section = section ?? null;
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled);
  const [modulesBusy, setModulesBusy] = useState(false);
  const modulesBusyRef = useRef(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const pickingBackup = useRef(false);
  const [canRestoreSafety, setCanRestoreSafety] = useState(false);
  const [sampleDataPresent, setSampleDataPresent] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  useEffect(() => {
    if (activeSection) return;
    const onBack = () => {
      router.replace(getHubRoute(activeAppId) as Href);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [activeSection, router, activeAppId]);

  useEffect(() => {
    void getHapticsEnabled().then(setHapticsOn).catch(() => {
      toast.error(t("errorLoadingData"));
    });
    void hasSafetyBackup()
      .then(setCanRestoreSafety)
      .catch(() => {
        // A failed check only hides the optional restore action.
        setCanRestoreSafety(false);
      });
    void hasSampleData()
      .then(setSampleDataPresent)
      .catch(() => {
        // A failed check only hides the optional reset action.
        setSampleDataPresent(false);
      });
  }, [t]);

  /** Restore the snapshot taken automatically before the last import. */
  const runSafetyRestore = useCallback(async () => {
    setBackupBusy(true);
    try {
      await restoreSafetyBackup();
      resetPlainTextBackfill();
      setCanRestoreSafety(false);
      toast.success(t("importSuccess"));
      setConfirmAction(null);
    } catch (recoveryError) {
      const reason =
        recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      toast.error(t("importFailedReason", { reason }));
      setConfirmAction(null);
    } finally {
      setBackupBusy(false);
    }
  }, [t]);

  /** Remove the demo rows written on first run, so the app starts from scratch. */
  const runClearSampleData = useCallback(async () => {
    setBackupBusy(true);
    try {
      const removed = await clearSampleData();
      if (removed) {
        setSampleDataPresent(false);
        toast.success(t("sampleDataCleared"));
      }
    } catch {
      toast.error(t("sampleDataClearFailed"));
    } finally {
      setBackupBusy(false);
      setConfirmAction(null);
    }
  }, [t]);

  const handleClearSampleData = useCallback(() => {
    setConfirmAction({
      title: t("sampleDataClear"),
      message: t("sampleDataClearConfirm"),
      confirmLabel: t("sampleDataClear"),
      destructive: true,
      onConfirm: () => runClearSampleData(),
    });
  }, [t, runClearSampleData]);

  /** Offer the restore after an import that may have replaced the wrong file. */
  const handleRestoreSafety = useCallback(() => {
    setConfirmAction({
      title: t("importRecoveryTitle"),
      message: t("importRestoreHint"),
      confirmLabel: t("restoreSafetyBackup"),
      destructive: true,
      onConfirm: () => runSafetyRestore(),
    });
  }, [t, runSafetyRestore]);

  const toggleHaptics = useCallback(async (val: boolean) => {
    setHapticsOn(val);
    try {
      await setHapticsEnabled(val);
    } catch {
      setHapticsOn(!val);
      toast.error(t("saveFailed"));
      return;
    }
    if (val) void haptics.light();
  }, [haptics, t]);

  const toggleModule = useCallback(async (id: string) => {
    if (modulesBusyRef.current) return;
    const next = toggleEnabledModule(enabledIds, id);
    if (next === enabledIds) return;
    modulesBusyRef.current = true;
    setModulesBusy(true);
    try {
      await saveEnabledIds(next);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      modulesBusyRef.current = false;
      setModulesBusy(false);
    }
  }, [enabledIds, saveEnabledIds, t]);

  const openSection = useCallback((next: SettingsSection) => {
    void haptics.light();
    router.push({ pathname: "/settings/[section]", params: { section: next, from: activeAppId } } as Href);
  }, [activeAppId, haptics, router]);

  const replayTutorial = useCallback(() => {
    void (async () => {
      await haptics.light();
      try {
        await setTutorialSeen(false);
        router.replace("/(tutorial)" as Href);
      } catch {
        toast.error(t("saveFailed"));
      }
    })();
  }, [haptics, router, t]);

  const leaveDetail = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`${getHubRoute(activeAppId)}/settings` as Href);
  }, [activeAppId, router]);

  useEffect(() => {
    if (!activeSection) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      void leaveDetail();
      return true;
    });
    return () => sub.remove();
  }, [activeSection, leaveDetail]);

  const handleExport = useCallback(async (destination: "folder" | "share") => {
    if (backupBusy || pickingBackup.current) return;
    pickingBackup.current = true;
    setBackupBusy(true);
    try {
      const uri = destination === "folder" ? await exportBackupToDirectory() : await exportAndShareBackup();
      if (uri !== null) toast.success(t(destination === "folder" ? "backupSaved" : "exportSuccess"));
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      pickingBackup.current = false;
      setBackupBusy(false);
    }
  }, [backupBusy, t]);

  const handleImportPick = useCallback(async () => {
    if (backupBusy || pickingBackup.current) return;
    pickingBackup.current = true;
    setBackupBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const uri = res.assets[0].uri;
      let json: string;
      try {
        json = await readJsonFromFileUri(uri);
      } catch {
        toast.error(t("importInvalidFile"));
        return;
      }
      const preview = previewBackupFromJson(json);
      const previewDate = preview.exportedAt ? new Date(preview.exportedAt).toLocaleString() : t("backupPreviewUnknownDate");
      const message = [t("importConfirmMessage"), t("backupPreviewDate", { date: previewDate }),
        t("backupPreviewCounts", { tasks: preview.tasks ?? "—", notes: preview.notes, budgets: preview.budgets }),
        preview.tasks === null ? t("backupPreviewTasksKept") : null].filter(Boolean).join("\n\n");
      setConfirmAction({
        title: t("importData"),
        message,
        confirmLabel: t("importData"),
        destructive: true,
        onConfirm: async () => {
          setBackupBusy(true);
          try {
            await importBackupFromJson(json);
            resetPlainTextBackfill();
            setCanRestoreSafety(await hasSafetyBackup());
            toast.success(t("importSuccess"));
            setConfirmAction(null);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            toast.error(t("importFailedReason", { reason }));
            setConfirmAction(null);
            if (await hasSafetyBackup()) {
              setCanRestoreSafety(true);
              setConfirmAction({
                title: t("importRecoveryTitle"),
                message: t("importRecoveryMessage"),
                confirmLabel: t("restoreSafetyBackup"),
                destructive: true,
                onConfirm: () => runSafetyRestore(),
              });
            }
          } finally {
            setBackupBusy(false);
          }
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(t("importFailedReason", { reason }));
    } finally {
      pickingBackup.current = false;
      setBackupBusy(false);
    }
  }, [backupBusy, t, runSafetyRestore]);

  if (!activeSection) {
    return (
      <>
        <ScrollView className="flex-1 bg-background">
          <View className="w-full max-w-md self-center gap-4 px-4 max-[360px]:px-3 pt-2 pb-28">
            <View className="gap-1"><Text accessibilityRole="header" className="text-2xl max-[360px]:text-[21px] font-semibold tracking-[-0.4px] text-foreground">{t("settingsTitle")}</Text><Text className="text-xs leading-[18px] text-muted-foreground">{t("settingsSubtitle")}</Text></View>
            <SettingsMenu
              theme={theme}
              version={`Personal Hub · ${getAppVersion()}`}
              hapticsOn={hapticsOn}
              onThemeChange={(next) => { void haptics.light(); setTheme(next); }}
              onHapticsChange={(next) => { void toggleHaptics(next); }}
              onSelect={openSection}
              onReplayTutorial={replayTutorial}
            />
            <Text className="mt-1 text-center text-xs text-muted-foreground">{t("settingsOffline")}</Text>
          </View>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <FormDialog title={activeSection === "backup" ? t("settingsBackupRestore") : activeSection === "modules" ? t("settingsModules") : t("settingsAboutUpdates")} busy={backupBusy || modulesBusy} onClose={leaveDetail}>
        {activeSection === "modules" && (
          <View className="gap-3">
            <Text className="text-sm leading-6 text-muted-foreground">{t("settingsModulesHelp")}</Text>
            <ModuleChooser enabledIds={enabledIds} onToggle={(id) => { void toggleModule(id); }} disabled={modulesBusy} />
          </View>
        )}

        {activeSection === "backup" && (
          <View className="gap-3">
            <Text className="text-sm leading-6 text-muted-foreground">{t("settingsBackupHelp")}</Text>
            <View className="rounded-[14px] border border-border/60 bg-card p-3 gap-3">
              <Button icon={Download} label={t("exportData")} disabled={backupBusy} onPress={() => setExportOpen(true)} />
              <Pressable
                onPress={() => { void haptics.light(); void handleImportPick(); }}
                disabled={backupBusy}
                className="flex-row items-center justify-center gap-2 min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 disabled:opacity-60"
                android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                accessibilityRole="button"
                accessibilityLabel={t("importData")}
              >
                <Cloud size={16} color={colors.foreground} />
                <Text className="text-sm font-medium text-foreground">{t("importData")}</Text>
              </Pressable>
              {canRestoreSafety ? (
                <Pressable
                  onPress={() => { void haptics.light(); handleRestoreSafety(); }}
                  disabled={backupBusy}
                  className="flex-row items-center justify-center gap-2 rounded-lg border border-destructive px-4 py-2.5 disabled:opacity-60"
                  android_ripple={{ color: withAlpha(colors.destructive, 0.125) }}
                  accessibilityRole="button"
                  accessibilityLabel={t("restoreSafetyBackup")}
                >
                  <RotateCcw size={16} color={colors.destructive} />
                  <Text className="text-sm font-medium text-destructive">{t("restoreSafetyBackup")}</Text>
                </Pressable>
              ) : null}
              {backupBusy ? <Text className="text-center text-xs text-muted-foreground">{t("savingAuto")}</Text> : null}
            </View>
            {sampleDataPresent ? (
              <View className="gap-2">
                <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsDataManagement")}</Text>
                <Pressable
                  onPress={handleClearSampleData}
                  disabled={backupBusy}
                  className="min-h-[48px] flex-row items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 active:bg-muted/60 disabled:opacity-60"
                  android_ripple={{ color: withAlpha(colors.destructive, 0.125) }}
                  accessible accessibilityRole="button" accessibilityLabel={t("sampleDataClear")}
                >
                  <Trash2 size={20} color={colors.destructive} />
                  <View className="flex-1">
                    <Text className="text-base font-medium text-destructive">{t("sampleDataClear")}</Text>
                    <Text className="mt-0.5 text-xs text-muted-foreground">{t("sampleDataDescription")}</Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {activeSection === "about" && (
          <View className="gap-3">
            <Text className="text-sm leading-6 text-muted-foreground">{t("settingsAboutHelp")}</Text>
            <UpdateCard />
            <View className="rounded-[14px] border border-border/60 bg-card p-3">
              <View className="items-center gap-3 py-4">
                <Image source={require("../../assets/icon-personal-hub.png")} className="h-16 w-16 rounded-xl" />
                <Text className="text-lg font-bold text-foreground">{t("appName")}</Text>
                <Text className="text-sm text-muted-foreground">{t("version")}: {getAppVersion()}</Text>
                <Text className="text-center text-sm text-muted-foreground">{t("aboutDescription")}</Text>
                <Pressable
                  onPress={() => {
                    void Linking.openURL("https://www.flaticon.com/uicons").catch(() => {
                      toast.error(t("linkOpenFailed"));
                    });
                  }}
                  accessibilityRole="link"
                  accessibilityLabel={t("flaticonAttribution")}
                >
                  <Text className="text-center text-xs text-muted-foreground underline">
                    {t("flaticonAttribution")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
     </FormDialog>
     <ActionDialog visible={exportOpen} title={t("exportData")} onClose={() => setExportOpen(false)} actions={[
       ...(Platform.OS === "android" ? [{ key: "folder", label: t("saveBackupToFolder"), primary: true, onPress: () => { void handleExport("folder"); } }] : []),
       { key: "share", label: t("shareBackup"), primary: Platform.OS !== "android", onPress: () => { void handleExport("share"); } },
     ]} />
      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction?.title ?? t("deleteConfirmTitle")}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.confirmLabel ?? t("confirm")}
        cancelLabel={t("cancel")}
        destructive={confirmAction?.destructive ?? false}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm()}
      />
    </>
   );
}
