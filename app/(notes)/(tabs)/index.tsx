import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, TextInput, FlatList, StyleSheet, type ListRenderItemInfo } from "react-native";
import { FileText, Plus, Search, XCircle } from "../../../src/components/AppIcons";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n, type TKey } from "../../../src/lib/i18n";
import {
  loadNotes,
  searchNotes,
  type Note,
} from "../../../src/lib/notes";
import { NoteCard } from "../../../src/components/NoteCard";
import { useThemeColors } from "../../../src/lib/theme";
import { useHaptics } from "../../../src/hooks/useHaptics";

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 },
});

function splitIntoColumns(items: Note[], count: number): Note[][] {
  const cols: Note[][] = Array.from({ length: count }, () => []);
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].length < cols[target].length) target = i;
    }
    cols[target].push(item);
  }
  return cols;
}

function zipColumnsToRows(cols: Note[][]): (Note | null)[][] {
  const maxLen = Math.max(0, ...cols.map((c) => c.length));
  const rows: (Note | null)[][] = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push(cols.map((c) => c[i] ?? null));
  }
  return rows;
}

type NotesListRow =
  | { type: "section"; key: string; labelKey: TKey; spacedTop?: boolean }
  | { type: "notes"; key: string; notes: (Note | null)[] };

export default function NotesListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const searchRef = useRef("");

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const load = useCallback(async (query: string) => {
    const seq = ++searchSeqRef.current;
    try {
      const q = query.trim();
      const result = q ? await searchNotes(q) : await loadNotes();
      if (seq !== searchSeqRef.current) return;
      setNotes(result);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setNotes([]);
      toast.error(t("errorLoadingData"));
    }
  }, [t]);

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
    searchRef.current = "";
    void load("");
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(searchRef.current);
    }, [load])
  );

  const handleNew = useCallback(() => {
    router.push("/(notes)/editor");
  }, [router]);

  const handleNotePress = useCallback(
    (noteId: number) => {
      void haptics.light();
      router.push({ pathname: "/(notes)/editor", params: { id: noteId } });
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
                  untitledLabel={t("notesUntitled")}
                  onPress={handleNotePress}
                />
              </View>
            ) : (
              <View key={`empty-${i}`} className="flex-1" />
            )
          )}
        </View>
      );
    },
    [t, handleNotePress]
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
              searchRef.current = v;
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
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}
