import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, TextInput, FlatList, StyleSheet, type ListRenderItemInfo } from "react-native";
import { FileText, Plus, Search, XCircle, Pin } from "../../src/components/AppIcons";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n, type TKey } from "../../src/lib/i18n";
import {
  loadNotes,
  searchNotes,
  getNoteTextColorClass,
  getNoteColorClass,
  type Note,
} from "../../src/lib/notes";
import { getPreviewSegments } from "../../src/lib/noteContent";
import { NOTE_TEXT_HEX } from "../../src/constants/theme";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 },
});

function splitIntoColumns(items: Note[], count: number): Note[][] {
  const cols: Note[][] = Array.from({ length: count }, () => []);
  for (const item of items) {
    cols[0].push(item);
    cols.sort((a, b) => a.length - b.length);
  }
  return cols;
}

function zipColumnsToRows(cols: Note[][]): (Note | null)[][] {
  const maxLen = Math.max(0, ...cols.map((c) => c.length));
  const rows: (Note | null)[][] = [];
  for (let i = 0; i < maxLen; i++) {
    // Preserve column slots (null = empty) so a single note stays half-width,
    // matching the original two-column masonry layout.
    rows.push(cols.map((c) => c[i] ?? null));
  }
  return rows;
}

type NotesListRow =
  | { type: "section"; key: string; labelKey: TKey; spacedTop?: boolean }
  | { type: "notes"; key: string; notes: (Note | null)[] };

const NoteCard = React.memo(function NoteCard({
  note,
  isDark,
  onPress,
  untitledLabel,
}: {
  note: Note;
  isDark: boolean;
  onPress: () => void;
  untitledLabel: string;
}) {
  const textColorClass = getNoteTextColorClass(note.color, isDark);
  const colors = useThemeColors();
  const bgColorClass = getNoteColorClass(note.color, isDark);
  const previewColor = NOTE_TEXT_HEX[note.color][isDark ? "dark" : "light"];

  const previewLines = useMemo(() => {
    if (!note.content) return [];
    return getPreviewSegments(note.content, 3);
  }, [note.content]);

  return (
    <Pressable
      onPress={onPress}
      className={`relative mb-2 rounded-lg border border-border/50 p-3 ${bgColorClass}`}
      accessibilityRole="button"
      accessibilityLabel={note.title || untitledLabel}
    >
      {note.is_pinned ? (
        <View className="absolute top-2 right-2">
          <Pin size={12} color={colors.mutedForeground} />
        </View>
      ) : null}
      {note.title ? (
        <Text
          numberOfLines={2}
          className={`text-base font-medium ${textColorClass}`}
        >
          {note.title}
        </Text>
      ) : null}
      {previewLines.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          {previewLines.map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: previewColor,
              }}
            >
              {line.map((segment, segmentIndex) => (
                <Text
                  key={`${i}-${segmentIndex}`}
                  style={{
                    fontWeight: segment.bold ? "700" : undefined,
                    fontStyle: segment.italic ? "italic" : undefined,
                    textDecorationLine: segment.strikethrough ? "line-through" : "none",
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

export default function NotesListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme !== "light";
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const load = useCallback(async (query?: string) => {
    try {
      const q = query ?? searchQuery;
      if (q.trim()) {
        setNotes(await searchNotes(q.trim()));
      } else {
        setNotes(await loadNotes());
      }
    } catch {
      setNotes([]);
      toast.error(t("errorLoadingData"));
    }
  }, [searchQuery, t]);

  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void load(query);
      }, 300);
    },
    [load]
  );

  const clearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSearchQuery("");
    void load("");
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleNew = useCallback(() => {
    router.push("/(notes)/editor");
  }, [router]);

  const handleNotePress = useCallback(
    (note: Note) => {
      void haptics.light();
      router.push({ pathname: "/(notes)/editor", params: { id: note.id } });
    },
    [router, haptics]
  );

  const pinnedNotes = useMemo(
    () => notes.filter((n) => n.is_pinned),
    [notes]
  );
  const otherNotes = useMemo(
    () => notes.filter((n) => !n.is_pinned),
    [notes]
  );

  const pinnedCols = useMemo(() => splitIntoColumns(pinnedNotes, 2), [pinnedNotes]);
  const otherCols = useMemo(() => splitIntoColumns(otherNotes, 2), [otherNotes]);

  const hasPinned = pinnedNotes.length > 0;

  const listData = useMemo<NotesListRow[]>(() => {
    if (notes.length === 0) return [];
    const data: NotesListRow[] = [];
    const pushRows = (cols: Note[][], prefix: string) => {
      for (const row of zipColumnsToRows(cols)) {
        data.push({
          type: "notes",
          key: `${prefix}-${row.map((n, i) => (n ? n.id : `e${i}`)).join("_")}`,
          notes: row,
        });
      }
    };
    if (hasPinned) {
      data.push({ type: "section", key: "section-pinned", labelKey: "notesPinned" });
      pushRows(pinnedCols, "pinned");
      data.push({ type: "section", key: "section-others", labelKey: "notesOthers", spacedTop: true });
      pushRows(otherCols, "other");
    } else {
      data.push({ type: "section", key: "section-all", labelKey: "notesTitle" });
      pushRows(otherCols, "other");
    }
    return data;
  }, [notes.length, hasPinned, pinnedCols, otherCols]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotesListRow>) => {
      if (item.type === "section") {
        return (
          <Text
            className={`mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground ${
              item.spacedTop ? "mt-4" : ""
            }`}
          >
            {t(item.labelKey)}
          </Text>
        );
      }
      return (
        <View className="flex-row gap-2">
          {item.notes.map((note, i) =>
            note ? (
              <View key={note.id} className="flex-1">
                <NoteCard
                  note={note}
                   isDark={isDark}
                   untitledLabel={t("notesUntitled")}
                  onPress={() => handleNotePress(note)}
                />
              </View>
            ) : (
              <View key={`empty-${i}`} className="flex-1" />
            )
          )}
        </View>
      );
    },
    [t, isDark, handleNotePress]
  );

  const listEmpty = useMemo(
    () => (
      <View className="items-center gap-3 py-20">
        <FileText size={40} color={colors.mutedForeground} />
        <Text className="text-sm text-muted-foreground">
          {searchQuery ? t("notesNoResults") : t("notesEmpty")}
        </Text>
        {!searchQuery && (
          <Text className="text-xs text-muted-foreground">
            {t("notesEmptyHint")}
          </Text>
        )}
      </View>
    ),
    [colors.mutedForeground, searchQuery, t]
  );

  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-0">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">
            {t("notesTitle")}
          </Text>
          <Pressable
            onPress={handleNew}
            className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-2"
            accessibilityRole="button"
            accessibilityLabel={t("notesNew")}
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="text-sm font-medium text-primary-foreground">
              {t("notesNew")}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row items-center gap-2 rounded-full bg-muted px-4 py-2.5">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={(v) => {
              setSearchQuery(v);
              debouncedSearch(v);
            }}
            placeholder={t("notesSearchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            className="flex-1 text-sm text-foreground"
          />
          {searchQuery.length > 0 && (
            <Pressable
               onPress={clearSearch}
              accessibilityRole="button"
               accessibilityLabel={t("clear")}
            >
              <XCircle size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        className="w-full max-w-md self-center"
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListEmptyComponent={listEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={styles.list}
      />
    </View>
  );
}
