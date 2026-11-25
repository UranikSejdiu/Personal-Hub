import { Text } from "./ui/Typography";
import React from "react";
import { View, Pressable } from "react-native";
import { CheckSquare, FileText, Pin } from "./AppIcons";
import { Checkbox } from "./ui/Checkbox";
import { useThemeColors } from "../lib/theme";
import { getPreviewSegments } from "../lib/noteContent";
import { formatNoteDate } from "../lib/noteDate";
import { cn } from "../lib/utils";
import type { Note } from "../types/notes";

export const NoteCard = React.memo(function NoteCard({
  note,
  onPress,
  layout = "grid",
  first = true,
  last = true,
}: {
  note: Note;
  onPress: (note: Note) => void;
  layout?: "grid" | "list";
  first?: boolean;
  last?: boolean;
}) {
  const colors = useThemeColors();
  const compact = layout === "list";

  const previewLines = React.useMemo(() => {
    if (!note.content) return [];
    return getPreviewSegments(note.content, compact ? 1 : 2);
  }, [compact, note.content]);

  const checklistItems = note.kind === "checklist" ? note.items ?? [] : [];
  const isChecklist = note.kind === "checklist";
  const activeItems = checklistItems.filter((item) => !item.checked);
  const checkedCount = note.checklistPreview?.checked ?? checklistItems.filter((item) => item.checked).length;
  const visibleItems = activeItems.slice(0, 2);
  const hiddenCount = (note.checklistPreview?.active ?? activeItems.length) - visibleItems.length;
  const totalCount = note.checklistPreview?.total ?? checklistItems.length;

  const title = note.title || "Untitled";
  const date = formatNoteDate(note.updated_at);
  const attachmentCount = note.attachmentCount ?? 0;
  const attachmentLabel = `${attachmentCount} ${attachmentCount === 1 ? "attachment" : "attachments"}`;
  const checklistStatus = `${checkedCount} of ${totalCount} done`;
  const previewLabel = previewLines[0]?.map(segment => segment.text).join("");
  const spokenLabel = compact
    ? [title, note.is_pinned && "Pinned", date, isChecklist ? checklistStatus : previewLabel, attachmentCount > 0 && attachmentLabel].filter(Boolean).join(", ")
    : title;
  return (
    <Pressable
      onPress={() => onPress(note)}
      className={cn(
        "min-h-[60px] bg-surface active:opacity-70",
        compact
          ? "justify-center border-x border-b border-border/60 px-4 py-2.5"
          : "mb-3 min-h-[64px] rounded-[24px] border border-border p-4",
        compact && first && "rounded-t-[24px] border-t",
        compact && last && "mb-3 rounded-b-[24px]",
      )}
      accessible
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text
          numberOfLines={compact ? 1 : 2}
          className="min-w-0 flex-1 text-base font-semibold text-foreground"
        >
          {title}
        </Text>
        {note.is_pinned ? (
          <View
            className="mt-0.5 shrink-0"
            accessible
            accessibilityRole="image"
            accessibilityLabel="Pinned"
          >
            <Pin size={14} color={colors.primary} />
          </View>
        ) : null}
        {compact && date !== "" && <Text className="shrink-0 text-label-medium text-muted-foreground">{date}</Text>}
      </View>

      {compact && (isChecklist || previewLabel || attachmentCount > 0) ? (
        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-1">
            {isChecklist && <CheckSquare size={14} color={colors.mutedForeground} />}
            <Text numberOfLines={1} className="min-w-0 flex-1 text-body-medium text-muted-foreground">
              {isChecklist ? checklistStatus : previewLabel}
            </Text>
          </View>
          {attachmentCount > 0 && (
            <View className="flex-row items-center gap-1">
              <FileText size={13} color={colors.mutedForeground} />
              <Text className="text-label-medium text-muted-foreground">{attachmentCount}</Text>
            </View>
          )}
        </View>
      ) : !compact && isChecklist ? (
        <View className="mt-1.5 gap-0.5">
          {visibleItems.map((item) => (
            <View key={item.id} className="flex-row items-start gap-1.5">
              <View className="mt-0.5">
                <Checkbox displayOnly checked={false} size="sm" />
              </View>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className="min-w-0 flex-1 text-body-medium text-foreground"
              >
                {item.text}
              </Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <Text className="text-label-medium text-muted-foreground">
              {`+${hiddenCount} more`}
            </Text>
          ) : null}
          <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary-container" accessible={false}>
            <View className="h-full rounded-full bg-primary" style={{ width: `${totalCount > 0 ? Math.min(100, checkedCount / totalCount * 100) : 0}%` }} />
          </View>
          <Text className="mt-1 text-label-medium text-muted-foreground">
            {`${checkedCount} of ${totalCount} completed`}
          </Text>
        </View>
      ) : !compact && previewLines.length > 0 ? (
        <View className="mt-2">
          {previewLines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-body-medium text-muted-foreground"
            >
              {line.map((segment, segmentIndex) => (
                <Text
                  key={`${i}-${segmentIndex}`}
                  style={{
                    fontFamily: "Urbanist",
                    fontWeight: segment.bold ? "700" : undefined,
                    fontStyle: segment.italic ? "italic" : undefined,
                    textDecorationLine: segment.strikethrough ? "line-through" : undefined,
                  }}
                >
                  {segment.text}
                </Text>
              ))}
            </Text>
          ))}
        </View>
      ) : null}
      {!compact && <View className="mt-2 flex-row flex-wrap gap-x-2">
        <Text className="text-label-medium text-muted-foreground">{date}</Text>
        {attachmentCount > 0 && <Text className="text-label-medium text-primary">{attachmentLabel}</Text>}
      </View>}
    </Pressable>
  );
});
