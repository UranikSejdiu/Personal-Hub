import { Pressable } from "react-native";
import { Archive, Pin, RotateCcw, Trash2 } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import { Button } from "./ui/Button";

interface NoteActionsProps {
  isPinned: boolean;
  isArchived: boolean;
  canDelete: boolean;
  disabled?: boolean;
  saving: boolean;
  onSave: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onToggleArchive: () => void;
}

export function NoteActions({ isPinned, isArchived, canDelete, disabled = false, saving, onSave, onTogglePin, onDelete, onToggleArchive }: NoteActionsProps) {
  const colors = useThemeColors();

  return (
    <>
      {!isArchived && <Pressable
        onPress={onTogglePin}
        disabled={disabled}
        className="h-12 w-12 items-center justify-center rounded-full bg-card p-2 active:opacity-70 disabled:opacity-50"
        accessible
        accessibilityRole="button"
        accessibilityLabel={isPinned ? "Unpin" : "Pin"}
        accessibilityState={{ selected: isPinned, disabled }}
      >
        <Pin size={20} color={isPinned ? colors.primary : colors.mutedForeground} />
      </Pressable>}
      {canDelete ? (
        <Pressable
          onPress={onToggleArchive}
          disabled={disabled}
          className="h-12 w-12 items-center justify-center rounded-full bg-card p-2 active:opacity-70 disabled:opacity-50"
          accessible
          accessibilityRole="button"
          accessibilityLabel={isArchived ? "Restore note" : "Save and archive note"}
          accessibilityHint={isArchived ? "Moves the note back to Notes so you can edit it." : "Saves your current changes before moving the note."}
          accessibilityState={{ disabled }}
        >
          {isArchived ? <RotateCcw size={20} color={colors.mutedForeground} /> : <Archive size={20} color={colors.mutedForeground} />}
        </Pressable>
      ) : null}
      {canDelete ? (
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          className="h-12 w-12 items-center justify-center rounded-full bg-card p-2 active:opacity-70 disabled:opacity-50"
          accessible
          accessibilityRole="button"
          accessibilityLabel="Delete note"
          accessibilityState={{ disabled }}
        >
          <Trash2 size={20} color={colors.destructive} />
        </Pressable>
      ) : null}
      {!isArchived && <Button label={saving ? "Saving…" : "Save"} accessibilityLabel="Save" accessibilityLiveRegion="polite"
        className="min-h-[48px] rounded-full px-4" busy={saving} disabled={disabled} onPress={onSave} />}
    </>
  );
}
