import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, Switch, BackHandler } from "react-native";
import { ChevronRight, Info, Palette, ArrowLeft, Vibrate, Target, Cloud, Download } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useI18n } from "../lib/i18n";
import { useTheme, useThemeColors, THEMES } from "../lib/theme";
import { getHapticsEnabled, setHapticsEnabled } from "../hooks/useHaptics";
import { APP_VERSION } from "../constants/config";
import { checkForUpdate, downloadAndInstall, openInstallSettings } from "../lib/updater";
import { loadSavingsGoal, saveSavingsGoal } from "../lib/budget";
import { ensureMonthlyAutoDeposit } from "../lib/savings";
import { NumberInput } from "./NumberInput";
import { toast } from "sonner-native";

type Section = "general" | "budget" | "backup" | "about" | null;

function UpdateProgress({ progress }: { progress: number | null }) {
  if (progress === null) return null;
  return (
    <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <View
        className="h-full rounded-full bg-primary"
        style={{ width: `${progress}%` }}
      />
    </View>
  );
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  "theme-light-dark": Palette,
  target: Target,
  cloud: Cloud,
  information: Info,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const [activeSection, setActiveSection] = useState<Section>(null);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [goalAmount, setGoalAmount] = useState(0);
  const [salary, setSalary] = useState(0);
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const goalRef = useRef(0);
  const salaryRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onBack = () => {
      if (activeSection) {
        setActiveSection(null);
        return true;
      }
      router.replace("/(budget)" as any);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [activeSection, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await checkForUpdate();
        if (!cancelled && result.status === "update") {
          setUpdateAvailable(true);
        }
      } catch {
        // silent background availability check
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getHapticsEnabled().then(setHapticsOn);
    loadSavingsGoal().then((sg) => {
      setGoalAmount(sg.goal_amount);
      setSalary(sg.salary);
      goalRef.current = sg.goal_amount;
      salaryRef.current = sg.salary;
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const scheduleGoalSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      setSaving(true);
      try {
        await saveSavingsGoal(goalRef.current, salaryRef.current);
        if (goalRef.current > 0) {
          await ensureMonthlyAutoDeposit(goalRef.current);
        }
      } catch {
        toast.error(t("saveFailed"));
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [t]);

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

  const toggleHaptics = useCallback(async (val: boolean) => {
    setHapticsOn(val);
    await setHapticsEnabled(val);
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setDownloadProgress(null);
    let downloaded = false;
    try {
      const result = await checkForUpdate();
      if (result.status === "update") {
        await downloadAndInstall(result.latest, {
          onProgress: (p) => {
            setDownloadProgress(p);
            if (p >= 100) downloaded = true;
          },
        });
        downloaded = true;
        toast.success(t("updateInstallerOpened"));
      } else if (result.status === "up-to-date") {
        toast.success(t("updateUpToDate"));
      } else if (result.status === "no-releases") {
        toast(t("updateNoReleases"));
      } else {
        toast.error(t("updateCheckFailed"));
      }
    } catch {
      if (!downloaded) {
        toast.error(t("updateCheckFailed"));
      } else {
        toast(t("updatePermissionNeeded"));
        openInstallSettings();
      }
    } finally {
      setCheckingUpdate(false);
      setDownloadProgress(null);
    }
  }, [t]);

  const MENU_ITEMS = [
    { section: "general" as const, icon: "theme-light-dark" as const, labelKey: "settingsGeneral" as const },
    { section: "budget" as const, icon: "target" as const, labelKey: "settingsBudget" as const },
    { section: "backup" as const, icon: "cloud" as const, labelKey: "settingsBackupSync" as const },
    { section: "about" as const, icon: "information" as const, labelKey: "settingsAbout" as const },
  ];

  if (!activeSection) {
    return (
      <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-foreground">{t("settingsTitle")}</Text>
          {updateAvailable && (
            <Pressable
              onPress={() => setActiveSection("about")}
              accessibilityRole="button"
              accessibilityLabel={t("newUpdateAvailable")}
              className="relative h-10 w-10 items-center justify-center rounded-full bg-primary/10"
            >
              <Download size={20} color={colors.primary} />
              <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-destructive" />
            </Pressable>
          )}
        </View>
        <View className="gap-2">
          {MENU_ITEMS.map((item) => {
            const Icon = ICON_MAP[item.icon] ?? Info;
            return (
              <Pressable
                key={item.section}
                onPress={() => setActiveSection(item.section)}
                className="flex-row items-center justify-between rounded-xl border border-border bg-card p-4"
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
    );
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => setActiveSection(null)}>
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
                    onPress={() => setTheme(th.value)}
                    className={`flex-row items-center gap-3 rounded-lg border p-3 ${
                      theme === th.value ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <View className={`h-5 w-5 rounded-full border-2 ${
                      theme === th.value ? "border-primary" : "border-border"
                    }`}>
                      {theme === th.value && <View className="m-0.5 h-full rounded-full bg-primary" />}
                    </View>
                    <Text className="text-sm text-foreground">{t(th.labelKey as "themeLight" | "themeDark")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="rounded-xl border border-border bg-card p-4">
              <Text className="mb-3 text-sm font-semibold text-foreground">{t("languageLabel")}</Text>
              <View className="flex-row gap-2">
                {(["sq", "en"] as const).map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setLang(l)}
                    className={`flex-1 rounded-lg border p-3 ${
                      lang === l ? "border-primary bg-primary/10" : "border-border"
                    }`}
                  >
                    <Text className={`text-center text-sm ${lang === l ? "font-semibold text-primary" : "text-foreground"}`}>
                      {l === "sq" ? "Shqip" : "English"}
                    </Text>
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
          <View className="rounded-xl border border-border bg-card p-4">
            <View className="items-center gap-3 py-8">
              <Cloud size={40} color={colors.mutedForeground} />
              <Text className="text-sm text-center text-muted-foreground">
                {t("backupComingSoon")}
              </Text>
            </View>
          </View>
        )}

        {activeSection === "about" && (
          <View className="rounded-xl border border-border bg-card p-4">
            <View className="items-center gap-3 py-6">
               <Info size={48} color={colors.foreground} />
              <Text className="text-lg font-bold text-foreground">{t("appName")}</Text>
              <Text className="text-sm text-muted-foreground">{t("version")}: {APP_VERSION}</Text>
              <Text className="text-center text-sm text-muted-foreground">{t("aboutDescription")}</Text>
            </View>
  <Pressable
               onPress={handleCheckForUpdate}
               disabled={checkingUpdate}
               className="mt-2 flex-row items-center justify-center gap-2 rounded-lg border border-border bg-primary/10 p-3"
             >
               <Cloud size={16} color={colors.primary} />
               <Text className="text-sm font-medium text-primary">
                 {checkingUpdate
                   ? downloadProgress !== null
                     ? t("downloadingUpdate", { percent: downloadProgress })
                     : t("checkingForUpdates")
                   : t("checkForUpdates")}
               </Text>
             </Pressable>
             <UpdateProgress progress={downloadProgress} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}
