import { Text, TextInput } from "./ui/Typography";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Pressable, FlatList, ActivityIndicator, StyleSheet, type ListRenderItemInfo } from "react-native";
import { Archive, FileText, LayoutGrid, List, Plus, Search, XCircle } from "./AppIcons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n, type TKey } from "../lib/i18n";
import {
  loadNotesPage,
  type Note,
  type NoteSort,
} from "../lib/notes";
import {
  getNotesPreferences,
  setNotesPreferences,
  type NoteViewMode,
} from "../lib/notesPreferences";
import { NoteCard } from "./NoteCard";
import { NoteTypeChooser } from "./NoteTypeChooser";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import type { NoteKind } from "../types/notes";

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 112 },
});

const SORT_OPTIONS: { value: NoteSort; labelKey: TKey }[] = [
  { value: "updated", labelKey: "notesSortUpdated" },
  { value: "created", labelKey: "notesSortCreated" },
  { value: "title", labelKey: "notesSortTitle" },
];

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

export default function NotesListScreen({ archived = false }: { archived?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<NoteViewMode>("grid");
  const [sort, setSort] = useState<NoteSort>("updated");
  const { triggerRef: sortButtonRef, anchor: sortMenuAnchor, open: openSortMenu, close: closeSortMenu } = useAnchoredMenu();
  const [chooserVisible, setChooserVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const pagingRef = useRef({ offset: 0, hasMore: false, loading: false });
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const searchRef = useRef("");
  const sortRef = useRef<NoteSort>("updated");
  const viewModeRef = useRef<NoteViewMode>("grid");

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const load = useCallback(
    async (query: string, nextSort: NoteSort, append = false) => {
      if (append && (pagingRef.current.loading || !pagingRef.current.hasMore)) return;
      const seq = append ? searchSeqRef.current : ++searchSeqRef.current;
      const offset = append ? pagingRef.current.offset : 0;
      pagingRef.current.loading = true;
      setLoading(true);
      setLoadFailed(false);
      try {
        const q = query.trim();
        const result = await loadNotesPage(q, nextSort, offset, 40, archived);
        if (seq !== searchSeqRef.current) return;
        pagingRef.current = { offset: result.nextOffset, hasMore: result.hasMore, loading: true };
        setNotes((current) => append ? [...current, ...result.notes] : result.notes);
      } catch {
        if (seq !== searchSeqRef.current) return;
        if (!append) {
          setNotes([]);
          pagingRef.current = { offset: 0, hasMore: false, loading: true };
        }
        setLoadFailed(true);
        toast.error(t("errorLoadingData"));
      } finally {
        if (seq === searchSeqRef.current) {
          pagingRef.current.loading = false;
          setLoading(false);
        }
      }
    },
    [archived, t]
  );

  const debouncedSearch = useCallback(
    (query: string) => {
      ++searchSeqRef.current;
      pagingRef.current = { offset: 0, hasMore: false, loading: false };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void load(query, sortRef.current);
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
    void load("", sortRef.current);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      // Read preferences before the first page, so opening the list does not
      // fetch once with defaults and again with the saved sort.
      void getNotesPreferences().then((preferences) => {
        if (!active) return;
        setViewMode(preferences.viewMode);
        setSort(preferences.sort);
        sortRef.current = preferences.sort;
        viewModeRef.current = preferences.viewMode;
        void load(searchRef.current, preferences.sort);
      });
      return () => {
        active = false;
        ++searchSeqRef.current;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        pagingRef.current.loading = false;
      };
    }, [load])
  );

  const handleNew = useCallback(() => {
    setChooserVisible(true);
  }, []);

  const handleSelectType = useCallback(
    (kind: NoteKind) => {
      setChooserVisible(false);
      router.push(kind === "checklist" ? "/(notes)/checklist" : "/(notes)/editor");
    },
    [router]
  );

  const handleToggleView = useCallback(() => {
    void haptics.light();
    const next: NoteViewMode = viewMode === "grid" ? "list" : "grid";
    setViewMode(next);
    void setNotesPreferences({ viewMode: next, sort: sortRef.current });
  }, [haptics, viewMode]);

  const handleSelectSort = useCallback(
    (next: NoteSort) => {
      closeSortMenu();
      if (next === sortRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      void haptics.light();
      sortRef.current = next;
      setSort(next);
      void setNotesPreferences({ viewMode: viewModeRef.current, sort: next });
      void load(searchRef.current, next);
    },
    [closeSortMenu, haptics, load]
  );

  const handleNotePress = useCallback(
    (note: Note) => {
      void haptics.light();
      router.push({
        pathname: note.kind === "checklist" ? "/(notes)/checklist" : "/(notes)/editor",
        params: { id: note.id },
      });
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

  const columns = viewMode === "grid" ? 2 : 1;
  const pinnedCols = useMemo(() => splitIntoColumns(pinnedNotes, columns), [pinnedNotes, columns]);
  const otherCols = useMemo(() => splitIntoColumns(otherNotes, columns), [otherNotes, columns]);

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
      data.push({ type: "section", key: "section-all", labelKey: archived ? "notesArchiveTitle" : "notesTitle" });
      pushRows(otherCols, "other");
    }
    return data;
  }, [archived, notes.length, hasPinned, pinnedCols, otherCols]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotesListRow>) => {
      if (item.type === "section") {
        return (
          <Text
            className={`mb-2.5 text-[15px] font-semibold text-foreground ${
              item.spacedTop ? "mt-3" : ""
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
                  layout={viewMode}
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
    [t, handleNotePress, viewMode]
  );

  const listEmpty = useMemo(
    () => (
      <View className="items-center gap-3 py-20">
        {archived ? <Archive size={40} color={colors.mutedForeground} /> : <FileText size={40} color={colors.mutedForeground} />}
        <Text className="text-sm text-muted-foreground">
          {searchQuery ? t("notesNoResults") : t(archived ? "notesArchiveEmpty" : "notesEmpty")}
        </Text>
        {!searchQuery && (
          <Text className="text-sm text-muted-foreground">
            {t(archived ? "notesArchiveEmptyHint" : "notesEmptyHint")}
          </Text>
        )}
      </View>
    ),
    [archived, colors.mutedForeground, searchQuery, t]
  );

  const nextViewLabel = viewMode === "grid" ? t("notesViewList") : t("notesViewGrid");

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding" automaticOffset>
      <View className="w-full max-w-md self-center gap-2 px-4 pt-2 pb-0">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-semibold tracking-[-0.4px] text-foreground">
            {t(archived ? "notesArchiveTitle" : "notesTitle")}
          </Text>
          {!archived && <Pressable
            onPress={handleNew}
            className="min-h-[44px] flex-row items-center gap-2 rounded-lg bg-primary px-3 py-2 active:opacity-70"
            accessible
            accessibilityRole="button"
            accessibilityLabel={t("notesNew")}
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="text-sm font-medium text-primary-foreground">
              {t("notesNew")}
            </Text>
          </Pressable>}
        </View>

        <View className="min-h-[44px] flex-row items-center gap-2 rounded-[13px] bg-secondary px-3">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={(v) => {
              setSearchQuery(v);
              searchRef.current = v;
              debouncedSearch(v);
            }}
            placeholder={t(archived ? "notesArchiveSearchPlaceholder" : "notesSearchPlaceholder")}
            accessibilityLabel={t(archived ? "notesArchiveSearchPlaceholder" : "notesSearchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            className="min-w-0 flex-1 text-sm text-foreground"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={clearSearch}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("clear")}
            >
              <XCircle size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <View className="flex-row items-center justify-between gap-2">
          <Pressable ref={sortButtonRef} onPress={() => { void haptics.light(); openSortMenu(); }}
            className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-2 rounded-lg px-1 active:opacity-70"
            accessible accessibilityRole="button" accessibilityLabel={`${t("notesSort")}: ${t(SORT_OPTIONS.find((option) => option.value === sort)!.labelKey)}`}
            accessibilityState={{ expanded: sortMenuAnchor !== null }}>
            <Text className="text-[11px] text-muted-foreground">{t("notesSort")}</Text>
            <Text numberOfLines={1} className="shrink text-xs text-foreground">{t(SORT_OPTIONS.find((option) => option.value === sort)!.labelKey)}</Text>
          </Pressable>
          <Pressable onPress={handleToggleView} className="h-11 w-11 items-center justify-center rounded-xl active:bg-muted"
            accessible accessibilityRole="button" accessibilityLabel={nextViewLabel}>
            {viewMode === "grid" ? <List size={18} color={colors.mutedForeground} /> : <LayoutGrid size={18} color={colors.mutedForeground} />}
          </Pressable>
        </View>
      </View>

      <FlatList
        className="w-full max-w-md self-center"
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListEmptyComponent={loading ? <ActivityIndicator className="py-12" color={colors.primary} accessibilityLabel={t("loading")} /> : loadFailed ? (
          <Pressable onPress={() => { void load(searchRef.current, sortRef.current); }} className="min-h-[44px] items-center justify-center rounded-xl bg-muted p-4 active:opacity-70" accessible accessibilityRole="button" accessibilityLabel={t("retry")}>
            <Text className="text-foreground">{t("retry")}</Text>
          </Pressable>
        ) : listEmpty}
        onEndReached={() => { if (!loadFailed) void load(searchRef.current, sortRef.current, true); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={notes.length > 0 && loading ? <ActivityIndicator className="py-4" color={colors.primary} accessibilityLabel={t("loading")} /> : notes.length > 0 && loadFailed ? (
          <Pressable onPress={() => { void load(searchRef.current, sortRef.current, true); }} className="min-h-[44px] items-center justify-center rounded-xl bg-muted p-4 active:opacity-70" accessible accessibilityRole="button" accessibilityLabel={t("retry")}><Text className="text-foreground">{t("retry")}</Text></Pressable>
        ) : null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
      />

      <AnchoredMenu anchor={sortMenuAnchor} onClose={closeSortMenu} items={SORT_OPTIONS.map((option) => ({
        key: option.value,
        label: t(option.labelKey),
        selected: option.value === sort,
        onPress: () => handleSelectSort(option.value),
      }))} />

      <NoteTypeChooser
        visible={chooserVisible}
        onClose={() => setChooserVisible(false)}
        onSelect={handleSelectType}
      />
    </KeyboardAvoidingView>
  );
}
