import { Text } from "./ui/Typography";
import React from "react";
import { View, Pressable } from "react-native";
import { Pin } from "./AppIcons";
import { Checkbox } from "./ui/Checkbox";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { getPreviewSegments } from "../lib/noteContent";
import { formatNoteDate } from "../lib/noteDate";
import type { Note } from "../types/notes";

const MAX_VISIBLE_CHECKLIST_ITEMS = 3;

export const NoteCard = React.memo(function NoteCard({
  note,
  onPress,
  untitledLabel,
  layout = "grid",
}: {
  note: Note;
  onPress: (note: Note) => void;
  untitledLabel: string;
  layout?: "grid" | "list";
}) {
  const colors = useThemeColors();
  const { t } = useI18n();

  const previewLines = React.useMemo(() => {
    if (!note.content) return [];
    return getPreviewSegments(note.content, 3);
  }, [note.content]);

  const checklistItems = note.kind === "checklist" ? note.items ?? [] : [];
  const isChecklist = note.kind === "checklist";
  const activeItems = checklistItems.filter((item) => !item.checked);
  const checkedCount = note.checklistPreview?.checked ?? checklistItems.filter((item) => item.checked).length;
  const visibleItems = activeItems.slice(0, MAX_VISIBLE_CHECKLIST_ITEMS);
  const hiddenCount = (note.checklistPreview?.active ?? activeItems.length) - visibleItems.length;
  const totalCount = note.checklistPreview?.total ?? checklistItems.length;

  return (
    <Pressable
      onPress={() => onPress(note)}
      className={`relative mb-2.5 rounded-[22px] bg-card px-4 py-[18px] active:opacity-70 ${layout === "grid" ? "min-h-[140px]" : "min-h-[112px]"}`}
      accessible
      accessibilityRole="button"
      accessibilityLabel={note.title || untitledLabel}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text
          numberOfLines={2}
          className="flex-1 text-[17px] leading-[23px] font-semibold text-foreground"
        >
          {note.title || untitledLabel}
        </Text>
        {note.is_pinned ? (
          <View
            className="mt-0.5 shrink-0"
            accessible
            accessibilityRole="image"
            accessibilityLabel={t("notesPinned")}
          >
            <Pin size={14} color={colors.primary} />
          </View>
        ) : null}
      </View>

      {isChecklist ? (
        <View className="mt-2 gap-1">
          {visibleItems.map((item) => (
            <View key={item.id} className="flex-row items-start gap-2 py-0.5">
              <View className="mt-0.5">
                <Checkbox displayOnly checked={false} size="sm" />
              </View>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className="flex-1 text-[13px] leading-5 text-foreground"
              >
                {item.text}
              </Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <Text className="text-xs leading-[18px] text-muted-foreground">
              {t("notesMoreItems", { count: hiddenCount })}
            </Text>
          ) : null}
          <View className="mt-2 h-1 overflow-hidden rounded-full bg-secondary" accessible={false}>
            <View className="h-full rounded-full bg-primary" style={{ width: `${totalCount > 0 ? Math.min(100, checkedCount / totalCount * 100) : 0}%` }} />
          </View>
          <Text className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {t("notesChecklistProgress", { completed: checkedCount, total: totalCount })}
          </Text>
        </View>
      ) : previewLines.length > 0 ? (
        <View className="mt-2">
          {previewLines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-sm leading-[23px] text-muted-foreground"
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
      <Text className="mt-4 text-[11px] leading-4 text-muted-foreground">{formatNoteDate(note.updated_at)}</Text>
    </Pressable>
  );
});
