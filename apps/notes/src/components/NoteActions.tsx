import { Pressable, View } from "react-native";
import { Archive, MoreHorizontal, Pin, RotateCcw, Trash2 } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";
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
  const { triggerRef, anchor, open, close } = useAnchoredMenu();

  return (
    <>
      {!isArchived && <Pressable
        onPress={onTogglePin}
        disabled={disabled}
        className={`h-12 w-12 items-center justify-center rounded-full p-2 active:opacity-70 disabled:opacity-50 ${isPinned ? "bg-secondary-container" : "active:bg-surface-container-high"}`}
        accessible
        accessibilityRole="button"
        accessibilityLabel={isPinned ? "Unpin" : "Pin"}
        accessibilityState={{ selected: isPinned, disabled }}
      >
        <Pin size={20} color={isPinned ? colors.onSecondaryContainer : colors.foreground} />
      </Pressable>}
      {canDelete ? (
        <>
          <View ref={triggerRef} collapsable={false}>
            <Pressable
              onPress={open}
              disabled={disabled}
              className="h-12 w-12 items-center justify-center rounded-full active:bg-surface-container-high disabled:opacity-50"
              accessibilityRole="button"
              accessibilityLabel="More note actions"
              accessibilityState={{ expanded: anchor !== null, disabled }}
            >
              <MoreHorizontal size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <AnchoredMenu anchor={anchor} onClose={close} items={[
            { key: "archive", label: isArchived ? "Restore" : "Archive", icon: isArchived ? RotateCcw : Archive, onPress: onToggleArchive },
            { key: "delete", label: "Delete", icon: Trash2, destructive: true, onPress: onDelete },
          ]} />
        </>
      ) : null}
      {!isArchived && <Button label={saving ? "Saving…" : "Save"} accessibilityLabel="Save" accessibilityLiveRegion="polite"
        className="min-h-[48px] rounded-full px-4" busy={saving} disabled={disabled} onPress={onSave} />}
    </>
  );
}
