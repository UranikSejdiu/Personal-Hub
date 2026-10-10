import { Text } from "./ui/Typography";
import { Pressable, Switch, View } from "react-native";
import type { ComponentType } from "react";
import { BookOpen, ChevronRight, Cloud, Info, LayoutGrid } from "./AppIcons";
import type { AppIconProps } from "./AppIcons";
import { useI18n, type TKey } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { type ThemeName } from "../constants/theme";
import { withAlpha } from "../lib/utils";

export type SettingsSection = "backup" | "about" | "modules";

interface SettingsMenuProps {
  theme: ThemeName;
  version?: string;
  hapticsOn: boolean;
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
      className="min-h-[50px] flex-row items-center gap-3 py-2.5"
      android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
      accessible accessibilityRole="button"
      accessibilityLabel={subtitle ? `${t(labelKey)}, ${subtitle}` : t(labelKey)}
    >
      <Icon size={19} color={colors.mutedForeground} />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-foreground">{t(labelKey)}</Text>
        {subtitle ? <Text className="mt-0.5 text-xs text-muted-foreground">{subtitle}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function SettingsMenu({ theme, version, hapticsOn, onThemeChange, onHapticsChange, onSelect, onReplayTutorial }: SettingsMenuProps) {
  const { t } = useI18n();
  const colors = useThemeColors();
  return (
    <View className="gap-[18px]">
      <View className="gap-2">
        <Text className="text-[15px] font-semibold text-foreground">{t("settingsAppearance")}</Text>
        <View className="rounded-[14px] border border-border/60 bg-card p-3">
          <Text className="mb-2 text-sm font-medium text-foreground">{t("themeLabel")}</Text>
          <View className="flex-row rounded-xl bg-background p-1">
            {(["light", "dark"] as const).map((value) => (
              <Pressable
                key={value} onPress={() => onThemeChange(value)}
                className={`min-h-[44px] flex-1 items-center justify-center rounded-lg ${theme === value ? "bg-primary/10" : ""}`}
                android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                accessible accessibilityRole="radio"
                accessibilityState={{ checked: theme === value }}
                accessibilityLabel={t(value === "light" ? "themeLight" : "themeDark")}
              >
                <Text className={`text-sm font-medium ${theme === value ? "text-primary" : "text-muted-foreground"}`}>
                  {t(value === "light" ? "themeLight" : "themeDark")}
                </Text>
              </Pressable>
            ))}
          </View>

        </View>
      </View>

      <View className="gap-2">
        <Text className="text-[15px] font-semibold text-foreground">{t("settingsPreferences")}</Text>
        <View className="overflow-hidden rounded-[14px] border border-border/60 bg-card px-3">
          <View className="min-h-[50px] flex-row items-center justify-between py-2.5">
            <Text className="flex-1 text-sm font-semibold text-foreground">{t("hapticsLabel")}</Text>
            <Switch value={hapticsOn} onValueChange={onHapticsChange} trackColor={{ false: colors.muted, true: colors.primary }} thumbColor={theme === "dark" ? colors.foreground : colors.card} accessibilityLabel={t("hapticsLabel")} />
          </View>
          <View className="h-px bg-border/60" />
          <SettingsRow icon={LayoutGrid} labelKey="settingsModules" subtitle={t("settingsModulesSummary")} onPress={() => onSelect("modules")} />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-[15px] font-semibold text-foreground">{t("settingsData")}</Text>
        <View className="overflow-hidden rounded-[14px] border border-border/60 bg-card px-3">
          <SettingsRow icon={Cloud} labelKey="settingsBackupRestore" subtitle={t("settingsBackupSummary")} onPress={() => onSelect("backup")} />
        </View>
      </View>
      <View className="gap-2">
        <Text className="text-[15px] font-semibold text-foreground">{t("settingsHelp")}</Text>
        <View className="overflow-hidden rounded-[14px] border border-border/60 bg-card px-3">
          <SettingsRow icon={BookOpen} labelKey="tutorialShowAgain" subtitle={t("settingsTutorialSummary")} onPress={onReplayTutorial} />
          <View className="h-px bg-border/60" />
          <SettingsRow icon={Info} labelKey="settingsAboutUpdates" subtitle={version} onPress={() => onSelect("about")} />
        </View>
      </View>
    </View>
  );
}
