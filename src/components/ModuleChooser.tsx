import { Pressable, Text, View } from "react-native";
import { Check } from "./AppIcons";
import { HUB_APPS } from "../hub/registry";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";

interface ModuleChooserProps {
  enabledIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}

export function ModuleChooser({ enabledIds, onToggle, disabled = false }: ModuleChooserProps) {
  const { t } = useI18n();
  const colors = useThemeColors();
  return (
    <View className="gap-2">
      {HUB_APPS.map((app) => {
        const checked = enabledIds.includes(app.id);
        const rowDisabled = disabled || (checked && enabledIds.length === 1);
        return (
          <Pressable
            key={app.id}
            onPress={() => onToggle(app.id)}
            disabled={rowDisabled}
            className={`min-h-[52px] flex-row items-center justify-between rounded-xl border px-4 py-3 active:bg-muted ${checked ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}
            accessible
            accessibilityRole="checkbox"
            accessibilityLabel={t(app.titleKey)}
            accessibilityState={{ checked, disabled: rowDisabled }}
          >
            <Text className="text-base font-medium text-foreground">{t(app.titleKey)}</Text>
            <View className={`h-6 w-6 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary" : "border-border bg-background"}`}>
              {checked ? <Check size={16} color={colors.primaryForeground} /> : null}
            </View>
          </Pressable>
        );
      })}
      <Text className="px-1 text-xs leading-5 text-muted-foreground">{t("modulesKeepOne")}</Text>
    </View>
  );
}
