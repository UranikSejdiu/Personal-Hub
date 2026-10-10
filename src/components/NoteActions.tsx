import { Pressable } from "react-native";
import { Archive, Pin, RotateCcw, Trash2 } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { Button } from "./ui/Button";

interface NoteActionsProps {
  isPinned: boolean;
  isArchived: boolean;
  canDelete: boolean;
  disabled?: boolean;
  variant?: "icons" | "labels";
  onTogglePin: () => void;
  onDelete: () => void;
  onToggleArchive: () => void;
}

export function NoteActions({ isPinned, isArchived, canDelete, disabled = false, variant = "icons", onTogglePin, onDelete, onToggleArchive }: NoteActionsProps) {
  const { t } = useI18n();
  const colors = useThemeColors();
  if (variant === "labels") return <>
    {!isArchived && <Button variant="secondary" icon={Pin} label={t(isPinned ? "notesUnpin" : "notesPin")} disabled={disabled} onPress={onTogglePin}
      className={isPinned ? "border-primary bg-primary/10" : undefined} accessibilityState={{ selected: isPinned }} />}
    {canDelete && <Button variant="secondary" icon={isArchived ? RotateCcw : Archive} label={t(isArchived ? "notesRestoreAction" : "notesArchiveAction")} accessibilityLabel={t(isArchived ? "notesUnarchive" : "notesArchive")} disabled={disabled}
      accessibilityHint={t(isArchived ? "notesRestoreHint" : "notesArchiveSaveHint")} onPress={onToggleArchive} />}
    {canDelete && <Button variant="secondary" icon={Trash2} label={t("delete")} accessibilityLabel={t("notesDelete")} disabled={disabled} onPress={onDelete} />}
  </>;

  return (
    <>
      {!isArchived && <Pressable
        onPress={onTogglePin}
        disabled={disabled}
        className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted disabled:opacity-50"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t(isPinned ? "notesUnpin" : "notesPin")}
        accessibilityState={{ selected: isPinned, disabled }}
      >
        <Pin size={20} color={isPinned ? colors.primary : colors.mutedForeground} />
      </Pressable>}
      {canDelete ? (
        <Pressable
          onPress={onToggleArchive}
          disabled={disabled}
          className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted disabled:opacity-50"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t(isArchived ? "notesUnarchive" : "notesArchive")}
          accessibilityHint={t(isArchived ? "notesRestoreHint" : "notesArchiveSaveHint")}
          accessibilityState={{ disabled }}
        >
          {isArchived ? <RotateCcw size={20} color={colors.mutedForeground} /> : <Archive size={20} color={colors.mutedForeground} />}
        </Pressable>
      ) : null}
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
