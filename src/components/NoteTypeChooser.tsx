import { Modal, Pressable, Text, View } from "react-native";
import { CheckSquare, FileText } from "./AppIcons";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";
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
  icon: typeof FileText;
}[] = [
  { kind: "text", labelKey: "notesNewText", hintKey: "notesNewTextHint", icon: FileText },
  { kind: "checklist", labelKey: "notesNewChecklist", hintKey: "notesNewChecklistHint", icon: CheckSquare },
];

export function NoteTypeChooser({ visible, onClose, onSelect }: NoteTypeChooserProps) {
  const haptics = useHaptics();
  const colors = useThemeColors();
  const { t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/50 px-4" onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="w-full max-w-sm gap-1 rounded-2xl bg-card p-4 shadow-xl"
        >
          <Text className="mb-1 px-2 text-lg font-semibold text-foreground">
            {t("notesNew")}
          </Text>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.kind}
              onPress={() => {
                void haptics.light();
                onSelect(option.kind);
              }}
              className="min-h-[44px] flex-row items-center gap-3 rounded-xl px-2 py-3 active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t(option.labelKey)}
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                <option.icon size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-medium text-foreground">
                  {t(option.labelKey)}
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">{t(option.hintKey)}</Text>
              </View>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
