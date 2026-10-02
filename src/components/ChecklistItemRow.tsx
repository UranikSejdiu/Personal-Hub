import { useEffect, useRef } from "react";
import { Pressable, TextInput, View, type TextInput as TextInputType } from "react-native";
import { GripVertical, X } from "./AppIcons";
import { Checkbox } from "./ui/Checkbox";
import { cn } from "../lib/utils";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";

/** A checklist item in the editor's local, reorderable form. */
export interface ChecklistEntry {
  key: string;
  text: string;
  checked: boolean;
}

interface ChecklistItemRowProps {
  item: ChecklistEntry;
  disabled?: boolean;
  isActive: boolean;
  drag: () => void;
  onToggle: (key: string) => void;
  onChangeText: (key: string, text: string) => void;
  onRemove: (key: string) => void;
  registerInput: (key: string, ref: TextInputType | null) => void;
}

export function ChecklistItemRow({
  item,
  disabled = false,
  isActive,
  drag,
  onToggle,
  onChangeText,
  onRemove,
  registerInput,
}: ChecklistItemRowProps) {
  const colors = useThemeColors();
  const { t } = useI18n();
  const inputRef = useRef<TextInputType>(null);

  useEffect(() => {
    registerInput(item.key, inputRef.current);
    return () => registerInput(item.key, null);
  }, [item.key, registerInput]);

  return (
    <View className={cn("flex-row items-start gap-1 px-3", isActive && "bg-muted/40")}>
      <Pressable
        onLongPress={drag}
        disabled={disabled && !isActive}
        delayLongPress={150}
        className="h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("reorderHandle")}
        accessibilityState={{ disabled: disabled && !isActive }}
      >
        <GripVertical size={18} color={colors.mutedForeground} />
      </Pressable>

      <Checkbox checked={item.checked}
        onPress={() => onToggle(item.key)}
        disabled={disabled}
        className="h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
        accessibilityLabel={item.text || t("notesItemPlaceholder")}
      />

      <TextInput
        ref={inputRef}
        value={item.text}
        editable={!disabled}
        onChangeText={(text) => onChangeText(item.key, text)}
        placeholder={t("notesItemPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
        scrollEnabled={false}
        className="min-h-[44px] min-w-0 flex-1 py-2 text-base text-foreground"
      />

      <Pressable
        onPress={() => onRemove(item.key)}
        disabled={disabled}
        className="h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("notesItemDelete")}
        accessibilityState={{ disabled }}
      >
        <X size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}
