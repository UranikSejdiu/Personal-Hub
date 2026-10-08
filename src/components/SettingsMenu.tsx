import { Text } from "./ui/Typography";
import { Pressable, Switch, View } from "react-native";
import type { ComponentType } from "react";
import { BookOpen, ChevronRight, Cloud, Info, LayoutGrid, Target } from "./AppIcons";
import type { AppIconProps } from "./AppIcons";
import { useI18n, type TKey } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { type ThemeName } from "../constants/theme";
import { withAlpha } from "../lib/utils";

export type SettingsSection = "budget" | "backup" | "about" | "modules";

interface SettingsMenuProps {
  theme: ThemeName;
  hapticsOn: boolean;
  budgetSummary: string;
  enabledIds: string[];
  onThemeChange: (theme: ThemeName) => void;
  onHapticsChange: (enabled: boolean) => void;
  onSelect: (section: SettingsSection) => void;
  onReplayTutorial: () => void;
}

function SettingsRow({ icon: Icon, labelKey, subtitle, onPress }: {
  icon: ComponentType<AppIconProps>;
  labelKey: TKey;
  subtitle?: string;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="min-h-[48px] flex-row items-center gap-3 px-3 py-2"
      android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
      accessible accessibilityRole="button"
      accessibilityLabel={subtitle ? `${t(labelKey)}, ${subtitle}` : t(labelKey)}
    >
      <Icon size={20} color={colors.mutedForeground} />
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-foreground">{t(labelKey)}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-muted-foreground">{subtitle}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function SettingsMenu({ theme, hapticsOn, budgetSummary, enabledIds, onThemeChange, onHapticsChange, onSelect, onReplayTutorial }: SettingsMenuProps) {
  const { t } = useI18n();
  const colors = useThemeColors();
  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsAppearance")}</Text>
        <View className="rounded-xl border border-border bg-card p-3">
          <Text className="mb-2 text-sm font-medium text-foreground">{t("themeLabel")}</Text>
          <View className="flex-row rounded-xl bg-muted/60 p-1">
            {(["light", "dark"] as const).map((value) => (
              <Pressable
                key={value} onPress={() => onThemeChange(value)}
                className={`min-h-[44px] flex-1 items-center justify-center rounded-lg ${theme === value ? "bg-card" : ""}`}
                android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                accessible accessibilityRole="radio"
                accessibilityState={{ checked: theme === value }}
                accessibilityLabel={t(value === "light" ? "themeLight" : "themeDark")}
              >
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
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          <SettingsRow icon={LayoutGrid} labelKey="settingsModules" onPress={() => onSelect("modules")} />
          <View className="ml-12 h-px bg-border" />
          <View className="min-h-[48px] flex-row items-center justify-between px-3 py-2">
            <Text className="flex-1 text-base font-medium text-foreground">{t("hapticsLabel")}</Text>
            <Switch value={hapticsOn} onValueChange={onHapticsChange} trackColor={{ false: colors.muted, true: colors.primary }} thumbColor={theme === "dark" ? colors.foreground : colors.card} accessibilityLabel={t("hapticsLabel")} />
          </View>
        </View>
      </View>

      {enabledIds.includes("budget") ? (
        <View className="gap-2">
          <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsBudget")}</Text>
          <View className="overflow-hidden rounded-xl border border-border bg-card">
            <SettingsRow icon={Target} labelKey="settingsBudgetDetails" subtitle={budgetSummary} onPress={() => onSelect("budget")} />
          </View>
        </View>
      ) : null}
      <View className="gap-2">
        <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsData")}</Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          <SettingsRow icon={Cloud} labelKey="settingsBackupRestore" onPress={() => onSelect("backup")} />
        </View>
      </View>
      <View className="gap-2">
        <Text className="px-1 text-xs font-semibold text-muted-foreground">{t("settingsHelp")}</Text>
        <View className="overflow-hidden rounded-xl border border-border bg-card">
          <SettingsRow icon={BookOpen} labelKey="tutorialShowAgain" onPress={onReplayTutorial} />
          <View className="ml-12 h-px bg-border" />
          <SettingsRow icon={Info} labelKey="settingsAboutUpdates" onPress={() => onSelect("about")} />
        </View>
      </View>
    </View>
  );
}
