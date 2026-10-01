import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, Switch, BackHandler, Image } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ChevronRight, Info, Palette, ArrowLeft, Vibrate, Target, Cloud, Download, BookOpen, RotateCcw, Trash2 } from "./AppIcons";
import { useRouter, type Href } from "expo-router";
import * as Linking from "expo-linking";
import { useI18n } from "../lib/i18n";
import { useTheme, useThemeColors, THEMES } from "../lib/theme";
import { ACCENT_ORDER, ACCENT_COLORS } from "../constants/theme";
import { useHaptics, getHapticsEnabled, setHapticsEnabled, isHapticsEnabled } from "../hooks/useHaptics";
import * as Haptics from "expo-haptics";
import { getAppVersion } from "../constants/config";
import { UpdateCard } from "./UpdateCard";
import { loadSavingsGoal, saveSavingsGoal } from "../lib/budget";
import { ensureMonthlyAutoDeposit } from "../lib/savings";
import {
  exportAndShareBackup,
  importBackupFromJson,
  hasSafetyBackup,
  restoreSafetyBackup,
  readJsonFromFileUri,
} from "../lib/backup";
import { NumberInput } from "./NumberInput";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "sonner-native";
import * as DocumentPicker from "expo-document-picker";
import { withAlpha } from "../lib/utils";
import { getHubRoute } from "../hub/registry";
import { setTutorialSeen } from "../lib/tutorial";
import { clearSampleData, hasSampleData } from "../lib/sampleData";
import { resetPlainTextBackfill } from "../lib/notes";

type Section = "general" | "budget" | "backup" | "about" | null;

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  "theme-light-dark": Palette,
  target: Target,
  cloud: Cloud,
  information: Info,
};

const ALL_MENU_ITEMS = [
  { section: "general" as const, icon: "theme-light-dark" as const, labelKey: "settingsGeneral" as const },
  { section: "budget" as const, icon: "target" as const, labelKey: "settingsBudget" as const },
  { section: "backup" as const, icon: "cloud" as const, labelKey: "settingsBackupSync" as const },
  { section: "about" as const, icon: "information" as const, labelKey: "settingsAbout" as const },
];

interface SettingsScreenProps {
  activeAppId: string;
}

export default function SettingsScreen({ activeAppId }: SettingsScreenProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [activeSection, setActiveSection] = useState<Section>(null);
  const [hapticsOn, setHapticsOn] = useState<boolean>(isHapticsEnabled);
  const [goalAmount, setGoalAmount] = useState(0);
  const [salary, setSalary] = useState(0);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [canRestoreSafety, setCanRestoreSafety] = useState(false);
const [sampleDataPresent, setSampleDataPresent] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const goalRef = useRef(0);
  const salaryRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalSaveInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const onBack = () => {
      if (activeSection) {
        setActiveSection(null);
        return true;
      }
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
    if (activeAppId === "budget") {
      void loadSavingsGoal().then((sg) => {
        setGoalAmount(sg.goal_amount);
        setSalary(sg.salary);
        goalRef.current = sg.goal_amount;
        salaryRef.current = sg.salary;
      }).catch(() => {
        toast.error(t("errorLoadingData"));
      });
    }
    void hasSampleData()
      .then(setSampleDataPresent)
      .catch(() => {
        // A failed check only hides the optional reset action.
        setSampleDataPresent(false);
      });
  }, [activeAppId, t]);

  const flushGoalSave = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setSaving(true);
      try {
        await saveSavingsGoal(goalRef.current, salaryRef.current);
        if (goalRef.current > 0) {
          await ensureMonthlyAutoDeposit(goalRef.current);
        }
      } catch {
        toast.error(t("saveFailed"));
      } finally {
        if (!options?.silent) setSaving(false);
      }
    },
    [t]
  );

  const scheduleGoalSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const saveTask = flushGoalSave();
      goalSaveInFlightRef.current = saveTask;
      void saveTask.then(() => {
        if (goalSaveInFlightRef.current === saveTask) {
          goalSaveInFlightRef.current = null;
        }
      });
    }, 800);
  }, [flushGoalSave]);

  const cancelAndDrainGoalSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (goalSaveInFlightRef.current) {
      await goalSaveInFlightRef.current;
    }
  }, []);

  // Unmount paths (hardware back, app switch) must flush a pending edit rather
  // than drop it, otherwise the edited value silently disappears.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void flushGoalSave({ silent: true });
      }
    };
  }, [flushGoalSave]);

  const handleGoalChange = useCallback(
    (v: number) => {
      setGoalAmount(v);
      goalRef.current = v;
      scheduleGoalSave();
    },
    [scheduleGoalSave]
  );

  const handleSalaryChange = useCallback(
    (v: number) => {
      setSalary(v);
      salaryRef.current = v;
      scheduleGoalSave();
    },
    [scheduleGoalSave]
  );

  const reloadBudgetGoal = useCallback(async () => {
    if (activeAppId !== "budget") return;
    const sg = await loadSavingsGoal();
    setGoalAmount(sg.goal_amount);
    setSalary(sg.salary);
    goalRef.current = sg.goal_amount;
    salaryRef.current = sg.salary;
  }, [activeAppId]);

  /** Restore the snapshot taken automatically before the last import. */
  const runSafetyRestore = useCallback(async () => {
    setBackupBusy(true);
    try {
      await cancelAndDrainGoalSave();
      await restoreSafetyBackup();
      resetPlainTextBackfill();
      setCanRestoreSafety(false);
      toast.success(t("importSuccess"));
      setConfirmAction(null);
      await reloadBudgetGoal();
    } catch (recoveryError) {
      const reason =
        recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      toast.error(t("importFailedReason", { reason }));
      setConfirmAction(null);
    } finally {
      setBackupBusy(false);
    }
  }, [t, reloadBudgetGoal, cancelAndDrainGoalSave]);

  /** Remove the demo rows written on first run, so the app starts from scratch. */
  const runClearSampleData = useCallback(async () => {
    setBackupBusy(true);
    try {
      await cancelAndDrainGoalSave();
      const removed = await clearSampleData();
      if (removed) {
        setSampleDataPresent(false);
        toast.success(t("sampleDataCleared"));
        await reloadBudgetGoal();
      }
    } catch {
      toast.error(t("sampleDataClearFailed"));
    } finally {
      setBackupBusy(false);
      setConfirmAction(null);
    }
  }, [t, reloadBudgetGoal, cancelAndDrainGoalSave]);

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
      if (val) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      toast.error(t("saveFailed"));
    }
  }, [t]);

  const handleExport = useCallback(async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      await exportAndShareBackup();
      toast.success(t("exportSuccess"));
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setBackupBusy(false);
    }
  }, [backupBusy, t]);

  const handleImportPick = useCallback(async () => {
    if (backupBusy) return;
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
      setConfirmAction({
        title: t("importData"),
        message: t("importConfirmMessage"),
        confirmLabel: t("importData"),
        destructive: true,
        onConfirm: async () => {
          setBackupBusy(true);
          try {
            // Drain local writes before replacing database state.
            await cancelAndDrainGoalSave();
            await importBackupFromJson(json);
            resetPlainTextBackfill();
            setCanRestoreSafety(await hasSafetyBackup());
            toast.success(t("importSuccess"));
            setConfirmAction(null);
            await reloadBudgetGoal();
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
    }
  }, [backupBusy, t, reloadBudgetGoal, runSafetyRestore, cancelAndDrainGoalSave]);

  if (!activeSection) {
    return (
      <>
        <ScrollView className="flex-1 bg-background">
          <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
          <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-foreground">{t("settingsTitle")}</Text>
        </View>
        <View className="gap-2">
          {ALL_MENU_ITEMS.filter((item) => item.section !== "budget" || activeAppId === "budget").map((item) => {
            const Icon = ICON_MAP[item.icon] ?? Info;
            return (
              <Pressable
                key={item.section}
                onPress={() => { void haptics.light(); setActiveSection(item.section); }}
                className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4"
                android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                accessibilityRole="button"
                accessibilityLabel={t(item.labelKey)}
              >
                <View className="flex-row items-center gap-3">
                   <Icon size={20} color={colors.foreground} />
                   <Text className="text-sm font-medium text-foreground">{t(item.labelKey)}</Text>
                 </View>
                 <ChevronRight size={20} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      </View>
      </ScrollView>
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

  return (
    <>
      <KeyboardAwareScrollView className="flex-1 bg-background" bottomOffset={16} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
          <View className="flex-row items-center gap-2">
            <Pressable onPress={() => setActiveSection(null)} accessibilityRole="button" accessibilityLabel={t("cancel")} android_ripple={{ color: withAlpha(colors.primary, 0.125) }}>
              <ArrowLeft size={24} color={colors.foreground} />
            </Pressable>
          <Text className="text-2xl font-bold text-foreground">
            {activeSection === "general"
              ? t("settingsGeneral")
              : activeSection === "budget"
                ? t("settingsBudget")
                : activeSection === "backup"
                  ? t("settingsBackupSync")
                  : t("settingsAbout")}
          </Text>
        </View>

        {activeSection === "general" && (
          <View className="gap-4">
            <View className="rounded-xl border border-border bg-card p-4">
              <Text className="mb-3 text-sm font-semibold text-foreground">{t("themeLabel")}</Text>
              <View className="gap-2">
                {THEMES.map((th) => (
                  <Pressable
                    key={th.value}
                    onPress={() => { void haptics.light(); setTheme(th.value); }}
                    className={`flex-row items-center gap-3 rounded-lg border p-3 ${
                      theme === th.value ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: theme === th.value }}
                    accessibilityLabel={t(th.labelKey)}
                  >
                    <View className={`h-5 w-5 rounded-full border-2 ${
                      theme === th.value ? "border-primary" : "border-border"
                    }`}>
                      {theme === th.value && <View className="m-0.5 h-full rounded-full bg-primary" />}
                    </View>
                    <Text className="text-sm text-foreground">{t(th.labelKey)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="rounded-xl border border-border bg-card p-4">
              <Text className="mb-3 text-sm font-semibold text-foreground">{t("accentLabel")}</Text>
              <View className="flex-row gap-3">
                {ACCENT_ORDER.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => { void haptics.light(); setAccent(name); }}
                    className={`h-8 w-8 items-center justify-center rounded-full border-2 ${
                      accent === name ? "border-foreground" : "border-border"
                    }`}
                    style={{ backgroundColor: ACCENT_COLORS[name].primary }}
                    android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: accent === name }}
                    accessibilityLabel={t(`accent_${name}` as "accent_blue")}
                  >
                    {accent === name && (
                      <View className="h-2.5 w-2.5 rounded-full bg-white" />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="rounded-xl border border-border bg-card p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                   <Vibrate size={20} color={colors.foreground} />
                   <Text className="text-sm font-medium text-foreground">{t("hapticsLabel")}</Text>
                 </View>
                 <Switch
                   value={hapticsOn}
                   onValueChange={toggleHaptics}
                   trackColor={{ false: colors.muted, true: colors.primary }}
                 />
               </View>
            </View>

            <Pressable
              onPress={() => {
                void (async () => {
                  await haptics.light();
                  try {
                    await setTutorialSeen(false);
                    router.replace("/(tutorial)" as Href);
                  } catch {
                    toast.error(t("saveFailed"));
                  }
                })();
              }}
              className="rounded-xl border border-border bg-card p-4"
              android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
              accessibilityRole="button"
              accessibilityLabel={t("tutorialShowAgain")}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <BookOpen size={20} color={colors.foreground} />
                  <Text className="text-sm font-medium text-foreground">{t("tutorialShowAgain")}</Text>
                </View>
                <ChevronRight size={20} color={colors.mutedForeground} />
              </View>
            </Pressable>

            {sampleDataPresent ? (
              <Pressable
                onPress={handleClearSampleData}
                disabled={backupBusy}
                className="rounded-xl border border-border bg-card p-4 disabled:opacity-60"
                android_ripple={{ color: withAlpha(colors.destructive, 0.125) }}
                accessibilityRole="button"
                accessibilityLabel={t("sampleDataClear")}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 flex-row items-center gap-3 pr-3">
                    <Trash2 size={20} color={colors.destructive} />
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-foreground">
                        {t("sampleDataClear")}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted-foreground">
                        {t("sampleDataDescription")}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color={colors.mutedForeground} />
                </View>
              </Pressable>
            ) : null}
          </View>
        )}

        {activeSection === "budget" && (
          <View className="gap-4">
            <View className="rounded-xl border border-border bg-card p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-muted-foreground">{t("goalAmount")}</Text>
                <NumberInput
                  value={goalAmount}
                  onChange={handleGoalChange}
                  min={0}
                  placeholder="0.00"
                  className="w-28 text-right"
                />
              </View>
             <View className="mt-2 flex-row items-center justify-between">
                 <Text className="text-sm text-muted-foreground">{t("salaryLabel")}</Text>
                 <NumberInput
                   value={salary}
                   onChange={handleSalaryChange}
                   min={0}
                   placeholder="0.00"
                   className="w-28 text-right"
                 />
               </View>

               {saving ? (
                 <Text className="text-right text-xs text-muted-foreground">
                   {t("savingAuto")}
                 </Text>
               ) : null}
             </View>
          </View>
        )}

        {activeSection === "backup" && (
          <View className="gap-4">
            <View className="rounded-xl border border-border bg-card p-4 gap-3">
              <View className="flex-row items-center gap-2">
                <Cloud size={20} color={colors.foreground} />
                <Text className="text-sm font-semibold text-foreground">{t("settingsBackupSync")}</Text>
              </View>
              <Pressable
                onPress={() => { void haptics.light(); void handleExport(); }}
                disabled={backupBusy}
                className="flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 disabled:opacity-60"
                android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
                accessibilityRole="button"
                accessibilityLabel={t("exportData")}
              >
                <Download size={16} color={colors.primaryForeground} />
                <Text className="text-sm font-medium text-primary-foreground">{t("exportData")}</Text>
              </Pressable>
              <Pressable
                onPress={() => { void haptics.light(); void handleImportPick(); }}
                disabled={backupBusy}
                className="flex-row items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 disabled:opacity-60"
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
          </View>
        )}

        {activeSection === "about" && (
          <View className="gap-4">
            <View className="rounded-xl border border-border bg-card p-4">
              <View className="items-center gap-3 py-6">
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
            <UpdateCard />
          </View>
        )}
       </View>
     </KeyboardAwareScrollView>
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
