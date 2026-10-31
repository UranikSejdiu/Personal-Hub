import type { ComponentType } from "react";
import { Pressable, View } from "react-native";
import { Check, ChevronRight, type AppIconProps } from "../AppIcons";
import { useThemeColors } from "../../lib/theme";
import { FormDialog } from "./FormDialog";
import { Button } from "./Button";
import { Text } from "./Typography";

export interface DialogAction {
  key: string; label: string; icon?: ComponentType<AppIconProps>; selected?: boolean;
  primary?: boolean; disabled?: boolean; onPress: () => void;
}

export function ActionDialog({ visible, title, actions, onClose, layout = "buttons" }: {
  visible: boolean; title: string; actions: readonly DialogAction[]; onClose: () => void; layout?: "buttons" | "list";
}) {
  const colors = useThemeColors();
  const select = (action: DialogAction) => { if (!action.disabled) { onClose(); action.onPress(); } };
  return <FormDialog visible={visible} title={title} onClose={onClose}>
    <View className={layout === "buttons" ? "flex-row flex-wrap gap-2" : "gap-1"}>
      {actions.map(action => layout === "buttons" ? <Button key={action.key} label={action.label}
        icon={action.icon} variant={action.primary ? "primary" : "secondary"} disabled={action.disabled} onPress={() => select(action)} /> :
        <Pressable key={action.key} disabled={action.disabled} onPress={() => select(action)} accessibilityRole="button"
          accessibilityLabel={action.label} accessibilityState={{ selected: action.selected, disabled: action.disabled }}
          className="min-h-[50px] flex-row items-center gap-3 rounded-[11px] px-1 py-2.5 active:bg-secondary disabled:opacity-50">
          {action.icon && <View className="h-[30px] w-[30px] items-center justify-center"><action.icon size={20} color={colors.primary} /></View>}
          <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground">{action.label}</Text>
          {action.selected ? <Check size={18} color={colors.primary} /> : <ChevronRight size={18} color={colors.mutedForeground} />}
        </Pressable>)}
    </View>
  </FormDialog>;
}
