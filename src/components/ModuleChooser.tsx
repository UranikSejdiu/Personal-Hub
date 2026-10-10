import { Text } from "./ui/Typography";
import { Pressable, View } from "react-native";
import { Checkbox } from "./ui/Checkbox";
import { HUB_APPS } from "../hub/registry";
import { useI18n } from "../lib/i18n";

interface ModuleChooserProps {
  enabledIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}

export function ModuleChooser({ enabledIds, onToggle, disabled = false }: ModuleChooserProps) {
  const { t } = useI18n();
  return (
    <View className="gap-2">
      <View className="rounded-[14px] border border-border/60 bg-card px-3">{HUB_APPS.map((app, index) => {
        const checked = enabledIds.includes(app.id);
        const rowDisabled = disabled || (checked && enabledIds.length === 1);
        return (
          <Pressable
            key={app.id}
            onPress={() => onToggle(app.id)}
            disabled={rowDisabled}
            className={`min-h-[50px] flex-row items-center justify-between py-2.5 active:bg-muted ${index > 0 ? "border-t border-border/60" : ""}`}
            accessible
            accessibilityRole="checkbox"
            accessibilityLabel={t(app.titleKey)}
            accessibilityState={{ checked, disabled: rowDisabled }}
          >
            <Text className="text-sm font-semibold text-foreground">{t(app.titleKey)}</Text>
            <Checkbox displayOnly checked={checked} />
          </Pressable>
        );
      })}</View>
      <Text className="px-1 text-xs leading-5 text-muted-foreground">{t("modulesKeepOne")}</Text>
    </View>
  );
}
