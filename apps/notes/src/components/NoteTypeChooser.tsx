import { useEffect } from "react";
import { BackHandler, View } from "react-native";
import { FileText, ListOrdered } from "./AppIcons";
import { PopMenuOption } from "./PopMenuOption";
import { useThemeColors } from "../lib/theme";
import type { NoteKind } from "../types/notes";

interface NoteTypeChooserProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: NoteKind) => void;
}

const OPTIONS: {
  kind: NoteKind;
  label: string;
  hint: string;
}[] = [
  { kind: "checklist", label: "Checklist", hint: "Track items with checkboxes" },
  { kind: "text", label: "Text note", hint: "Write in rich text" },
];

export function NoteTypeChooser({ visible, onClose, onSelect }: NoteTypeChooserProps) {
  const colors = useThemeColors();

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  return <View onAccessibilityEscape={onClose} accessibilityLabel="New Note"
    pointerEvents={visible ? "box-none" : "none"}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    className="mb-4 max-w-full self-end items-end gap-3">
    {OPTIONS.map((option, index) => {
      const Icon = option.kind === "text" ? FileText : ListOrdered;
      return <PopMenuOption key={option.kind} label={option.label} hint={option.hint}
        icon={<Icon size={20} color={colors.primary} />} visible={visible}
        distanceFromTrigger={OPTIONS.length - 1 - index} onPress={() => onSelect(option.kind)} />;
    })}
  </View>;
}
