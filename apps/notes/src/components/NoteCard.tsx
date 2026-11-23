import { Text } from "./ui/Typography";
import React from "react";
import { View, Pressable } from "react-native";
import { Pin } from "./AppIcons";
import { Checkbox } from "./ui/Checkbox";
import { useThemeColors } from "../lib/theme";
import { getPreviewSegments } from "../lib/noteContent";
import { formatNoteDate } from "../lib/noteDate";
import type { Note } from "../types/notes";

export const NoteCard = React.memo(function NoteCard({
  note,
  onPress,
  layout = "grid",
}: {
  note: Note;
  onPress: (note: Note) => void;
  layout?: "grid" | "list";
}) {
  const colors = useThemeColors();

  const previewLines = React.useMemo(() => {
    if (!note.content) return [];
    return getPreviewSegments(note.content, layout === "grid" ? 2 : 3);
  }, [layout, note.content]);

  const checklistItems = note.kind === "checklist" ? note.items ?? [] : [];
  const isChecklist = note.kind === "checklist";
  const activeItems = checklistItems.filter((item) => !item.checked);
  const checkedCount = note.checklistPreview?.checked ?? checklistItems.filter((item) => item.checked).length;
  const visibleItems = activeItems.slice(0, layout === "grid" ? 2 : 3);
  const hiddenCount = (note.checklistPreview?.active ?? activeItems.length) - visibleItems.length;
  const totalCount = note.checklistPreview?.total ?? checklistItems.length;

  const title = note.title || "Untitled";
  return (
    <Pressable
      onPress={() => onPress(note)}
      className="mb-2 min-h-[56px] rounded-xl bg-card px-3 py-2.5 active:opacity-70"
      accessible
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text
          numberOfLines={2}
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
      </View>

      {isChecklist ? (
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
          <View className="mt-1 h-1 overflow-hidden rounded-full bg-secondary" accessible={false}>
            <View className="h-full rounded-full bg-primary" style={{ width: `${totalCount > 0 ? Math.min(100, checkedCount / totalCount * 100) : 0}%` }} />
          </View>
          <Text className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {`${checkedCount} of ${totalCount} completed`}
          </Text>
        </View>
      ) : previewLines.length > 0 ? (
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
      <View className="mt-2 flex-row flex-wrap gap-x-2">
        <Text className="text-label-medium text-muted-foreground">{formatNoteDate(note.updated_at)}</Text>
        {(note.attachmentCount ?? 0) > 0 && <Text className="text-label-medium text-primary">{note.attachmentCount} {note.attachmentCount === 1 ? "attachment" : "attachments"}</Text>}
      </View>
    </Pressable>
  );
});
