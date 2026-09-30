import React from "react";
import { View, Text, Pressable } from "react-native";
import { Pin } from "./AppIcons";
import { CheckboxSquare } from "./CheckboxSquare";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { getPreviewSegments } from "../lib/noteContent";
import type { Note } from "../types/notes";

const MAX_VISIBLE_CHECKLIST_ITEMS = 6;

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
  const isChecklist = checklistItems.length > 0;
  const activeItems = checklistItems.filter((item) => !item.checked);
  const checkedCount = checklistItems.filter((item) => item.checked).length;
  const visibleItems = activeItems.slice(0, MAX_VISIBLE_CHECKLIST_ITEMS);
  const checkedLabel =
    checkedCount === 1
      ? t("notesCheckedItems", { count: checkedCount })
      : t("notesCheckedItemsPlural", { count: checkedCount });

  return (
    <Pressable
      onPress={() => onPress(note)}
      className="relative mb-2 rounded-lg border border-border/50 bg-card p-3"
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
            accessibilityLabel="Pinned"
          >
            <Pin size={14} color={colors.primary} />
          </View>
        ) : null}
      </View>

      {isChecklist ? (
        <View style={{ marginTop: 6 }}>
          {visibleItems.map((item) => (
            <View key={item.id} className="flex-row items-start gap-2 py-0.5">
              <View className="mt-0.5">
                <CheckboxSquare checked={false} size="sm" />
              </View>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className="flex-1 text-[13px] leading-[18px] text-muted-foreground"
              >
                {item.text}
              </Text>
            </View>
          ))}
          {checkedCount > 0 ? (
            <Text className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
              {`+ ${checkedLabel}`}
            </Text>
          ) : null}
        </View>
      ) : previewLines.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          {previewLines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {line.map((segment, segmentIndex) => (
                <Text
                  key={`${i}-${segmentIndex}`}
                  style={{
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
