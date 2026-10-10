import { Text } from "./ui/Typography";
import React from "react";
import { View, Pressable } from "react-native";
import { Pin } from "./AppIcons";
import { Checkbox } from "./ui/Checkbox";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { getPreviewSegments } from "../lib/noteContent";
import type { Note } from "../types/notes";

const MAX_VISIBLE_CHECKLIST_ITEMS = 3;

export const NoteCard = React.memo(function NoteCard({
  note,
  onPress,
  untitledLabel,
}: {
  note: Note;
  onPress: (note: Note) => void;
  untitledLabel: string;
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

  return (
    <Pressable
      onPress={() => onPress(note)}
      className="relative mb-2 min-h-[44px] rounded-xl border border-border/50 bg-card p-3 active:opacity-70"
      accessible
      accessibilityRole="button"
      accessibilityLabel={note.title || untitledLabel}
    >
      <View className="flex-row items-start justify-between gap-2">
        <Text
          numberOfLines={2}
          className="flex-1 text-base font-medium text-foreground"
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
        <View className="mt-2 gap-0.5">
          {visibleItems.map((item) => (
            <View key={item.id} className="flex-row items-start gap-2 py-0.5">
              <View className="mt-0.5">
                <Checkbox displayOnly checked={false} size="sm" />
              </View>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className="flex-1 text-sm leading-5 text-muted-foreground"
              >
                {item.text}
              </Text>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <Text className="text-sm leading-5 text-muted-foreground">
              {t("notesMoreItems", { count: hiddenCount })}
            </Text>
          ) : null}
          <Text className="mt-1 text-sm font-medium leading-5 text-muted-foreground">
            {t("notesChecklistProgress", { completed: checkedCount, total: note.checklistPreview?.total ?? checklistItems.length })}
          </Text>
        </View>
      ) : previewLines.length > 0 ? (
        <View className="mt-2">
          {previewLines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-sm leading-5 text-muted-foreground"
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
    </Pressable>
  );
});
