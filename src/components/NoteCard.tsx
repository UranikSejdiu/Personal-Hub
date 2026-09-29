import React from "react";
import { View, Text, Pressable } from "react-native";
import { Pin } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import { getPreviewSegments } from "../lib/noteContent";
import type { Note } from "../types/notes";

export const NoteCard = React.memo(function NoteCard({
  note,
  onPress,
  untitledLabel,
}: {
  note: Note;
  onPress: (noteId: number) => void;
  untitledLabel: string;
}) {
  const colors = useThemeColors();

  const previewLines = React.useMemo(() => {
    if (!note.content) return [];
    return getPreviewSegments(note.content, 3);
  }, [note.content]);

  return (
    <Pressable
      onPress={() => onPress(note.id)}
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
      {previewLines.length > 0 ? (
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
