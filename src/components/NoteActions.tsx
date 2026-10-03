import { Pressable } from "react-native";
import { Pin, Trash2 } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";

interface NoteActionsProps {
  isPinned: boolean;
  canDelete: boolean;
  disabled?: boolean;
  onTogglePin: () => void;
  onDelete: () => void;
}

export function NoteActions({ isPinned, canDelete, disabled = false, onTogglePin, onDelete }: NoteActionsProps) {
  const { t } = useI18n();
  const colors = useThemeColors();

  return (
    <>
      <Pressable
        onPress={onTogglePin}
        disabled={disabled}
        className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted disabled:opacity-50"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t(isPinned ? "notesUnpin" : "notesPin")}
        accessibilityState={{ selected: isPinned, disabled }}
      >
        <Pin size={20} color={isPinned ? colors.primary : colors.mutedForeground} />
      </Pressable>
      {canDelete ? (
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted disabled:opacity-50"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t("notesDelete")}
          accessibilityState={{ disabled }}
        >
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      ) : null}
    </>
  );
}
