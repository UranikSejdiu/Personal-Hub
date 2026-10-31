import { Pressable, View } from "react-native";
import { ChevronRight, FileText, ListOrdered } from "./AppIcons";
import { FormDialog } from "./ui/FormDialog";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { useI18n, type TKey } from "../lib/i18n";
import type { NoteKind } from "../types/notes";

interface NoteTypeChooserProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: NoteKind) => void;
}

const OPTIONS: {
  kind: NoteKind;
  labelKey: TKey;
  hintKey: TKey;
}[] = [
  { kind: "text", labelKey: "notesNewText", hintKey: "notesNewTextHint" },
  { kind: "checklist", labelKey: "notesNewChecklist", hintKey: "notesNewChecklistHint" },
];

export function NoteTypeChooser({ visible, onClose, onSelect }: NoteTypeChooserProps) {
  const haptics = useHaptics();
  const { t } = useI18n();
  const colors = useThemeColors();

  return <FormDialog visible={visible} title={t("notesNew")} onClose={onClose} placement="bottom">
    {OPTIONS.map(option => {
      const Icon = option.kind === "text" ? FileText : ListOrdered;
      return <Pressable key={option.kind} onPress={() => { void haptics.light(); onSelect(option.kind); }}
        accessibilityRole="button" accessibilityLabel={t(option.labelKey)} accessibilityHint={t(option.hintKey)}
        className="min-h-[80px] flex-row items-center gap-4 rounded-[20px] bg-secondary px-4 py-4 active:opacity-70">
        <Icon size={24} color={colors.primary} />
        <View className="min-w-0 flex-1 gap-1"><Text className="text-base font-semibold text-foreground">{t(option.labelKey)}</Text><Text className="text-sm text-muted-foreground">{t(option.hintKey)}</Text></View>
        <ChevronRight size={20} color={colors.mutedForeground} />
      </Pressable>;
    })}
  </FormDialog>;
}
