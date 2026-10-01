import { View, Text, Pressable } from "react-native";
import { ChevronRight, Info, Palette, Target, Cloud } from "./AppIcons";
import { useI18n, type TKey } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { withAlpha } from "../lib/utils";

export type SettingsSection = "general" | "budget" | "backup" | "about";
const ITEMS: { section: SettingsSection; icon: typeof Palette; labelKey: TKey }[] = [
  { section: "general", icon: Palette, labelKey: "settingsGeneral" },
  { section: "budget", icon: Target, labelKey: "settingsBudget" },
  { section: "backup", icon: Cloud, labelKey: "settingsBackupSync" },
  { section: "about", icon: Info, labelKey: "settingsAbout" },
];

export function SettingsMenu({ activeAppId, onSelect }: { activeAppId: string; onSelect: (section: SettingsSection) => void }) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  return (
    <View className="gap-2">
      {ITEMS.filter((item) => item.section !== "budget" || activeAppId === "budget").map(({ section, icon: Icon, labelKey }) => (
        <Pressable
          key={section}
          onPress={() => { void haptics.light(); onSelect(section); }}
          className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-border bg-card p-4 active:opacity-70"
          android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
          accessible
          accessibilityRole="button"
          accessibilityLabel={t(labelKey)}
        >
          <View className="flex-1 flex-row items-center gap-3">
            <Icon size={20} color={colors.foreground} />
            <Text className="flex-1 text-sm font-medium text-foreground">{t(labelKey)}</Text>
          </View>
          <ChevronRight size={20} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}
