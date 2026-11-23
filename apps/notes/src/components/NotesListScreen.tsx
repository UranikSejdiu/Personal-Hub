import { Text, TextInput } from "./ui/Typography";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Pressable, FlatList, ActivityIndicator, Keyboard, StyleSheet, type ListRenderItemInfo } from "react-native";
import { Archive, FileText, LayoutGrid, Plus, Search, Settings, XCircle } from "./AppIcons";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import {
  loadNotesPage,
  type Note,
  type NoteSort,
} from "../lib/notes";
import {
  getNotesPreferences,
  setNotesPreferences,
  type NotesPreferences,
  type NoteViewMode,
} from "../lib/notesPreferences";
import { NoteCard } from "./NoteCard";
import { NoteTypeChooser } from "./NoteTypeChooser";
import { NotesDisplayOptions } from "./NotesDisplayOptions";
import { FormDialog } from "./ui/FormDialog";
import { useThemeColors } from "../lib/theme";
import type { NoteKind } from "../types/notes";

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 8 },
});

const FILTERS: { kind: NoteKind | undefined; label: string }[] = [
  { kind: undefined, label: "All notes" },
  { kind: "text", label: "Notes" },
  { kind: "checklist", label: "Checklists" },
];

type NotesListRow =
  | { type: "section"; key: string; label: string; spacedTop?: boolean }
  | { type: "notes"; key: string; notes: (Note | null)[] };

export default function NotesListScreen({ archived = false }: { archived?: boolean }) {
  const router = useRouter();
  const colors = useThemeColors();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<NoteViewMode>("grid");
  const [sort, setSort] = useState<NoteSort>("updated");
  const [viewOptionsVisible, setViewOptionsVisible] = useState(false);
  const [displayReady, setDisplayReady] = useState(false);
  const [savingDisplay, setSavingDisplay] = useState(false);
  const displaySavingRef = useRef(false);
  const preferencesRef = useRef<NotesPreferences>({ viewMode: "grid", sort: "updated" });
  const [kindFilter, setKindFilter] = useState<NoteKind | undefined>();
  const kindRef = useRef<NoteKind | undefined>(undefined);
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const [chooserVisible, setChooserVisible] = useState(false);
  const creationProgress = useSharedValue(0);
  useEffect(() => {
    creationProgress.set(withTiming(chooserVisible ? 1 : 0, {
      duration: 180,
      reduceMotion: ReduceMotion.System,
    }));
  }, [chooserVisible, creationProgress]);
  const creationIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${creationProgress.get() * 45}deg` }],
  }));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);
  const pagingRef = useRef({ offset: 0, hasMore: false, loading: false });
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const searchRef = useRef("");
  const sortRef = useRef<NoteSort>("updated");

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
        const result = await loadNotesPage(q, nextSort, offset, 40, archived, kindRef.current);
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
        toast.error("Failed to load data.");
      } finally {
        if (seq === searchSeqRef.current) {
          pagingRef.current.loading = false;
          setLoading(false);
        }
      }
    },
    [archived]
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
      setDisplayReady(false);
      // Read preferences before the first page, so opening the list does not
      // fetch once with defaults and again with the saved sort.
      void getNotesPreferences().then((preferences) => {
        if (!active) return;
        setViewMode(preferences.viewMode);
        setSort(preferences.sort);
        preferencesRef.current = preferences;
        setDisplayReady(true);
        sortRef.current = preferences.sort;
        void load(searchRef.current, preferences.sort);
      });
      return () => {
        active = false;
        setChooserVisible(false);
        setViewOptionsVisible(false);
        ++searchSeqRef.current;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        pagingRef.current.loading = false;
      };
    }, [load])
  );

  const changeDisplay = async (patch: Partial<NotesPreferences>) => {
    if (!displayReady || displaySavingRef.current) return;
    const previous = preferencesRef.current;
    const next = { ...previous, ...patch };
    if (next.sort === previous.sort && next.viewMode === previous.viewMode) return;
    displaySavingRef.current = true;
    setSavingDisplay(true);
    preferencesRef.current = next;
    setViewMode(next.viewMode);
    setSort(next.sort);
    sortRef.current = next.sort;
    if (next.sort !== previous.sort) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      setNotes([]);
      void load(searchRef.current, next.sort);
    }
    try { await setNotesPreferences(next); }
    catch { toast.warning("View settings changed for this session only."); }
    finally { displaySavingRef.current = false; setSavingDisplay(false); }
  };

  const handleNew = useCallback(() => {
    setChooserVisible(current => !current);
  }, []);

  const closeChooser = useCallback(() => setChooserVisible(false), []);

  const handleSelectType = useCallback(
    (kind: NoteKind) => {
      setChooserVisible(false);
      router.push(kind === "checklist" ? "/(notes)/checklist" : "/(notes)/editor");
    },
    [router]
  );

  const handleFilter = (kind: NoteKind | undefined) => {
    if (kindRef.current === kind) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    kindRef.current = kind;
    setKindFilter(kind);
    setNotes([]);

    void load(searchRef.current, sortRef.current);
  };

  const handleNotePress = useCallback(
    (note: Note) => {

      router.push({
        pathname: note.kind === "checklist" ? "/(notes)/checklist" : "/(notes)/editor",
        params: { id: note.id, returnTab: archived ? "archive" : "index" },
      });
    },
    [router, archived]
  );

  const listData = useMemo<NotesListRow[]>(() => {
    const data: NotesListRow[] = [];
    const columns = viewMode === "grid" ? 2 : 1;
    const appendRows = (group: Note[]) => {
      for (let i = 0; i < group.length; i += columns) {
        const first = group[i];
        const row = columns === 1 ? [first] : [first, group[i + 1] ?? null];
        data.push({ type: "notes", key: String(first.id), notes: row });
      }
    };
    const pinned = archived ? [] : notes.filter(note => note.is_pinned);
    if (pinned.length) {
      data.push({ type: "section", key: "section-pinned", label: "Pinned" });
      appendRows(pinned);
      if (pinned.length < notes.length) {
        data.push({ type: "section", key: "section-others", label: "Unpinned", spacedTop: true });
        appendRows(notes.filter(note => !note.is_pinned));
      }
    } else {
      appendRows(notes);
    }
    return data;
  }, [archived, notes, viewMode]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotesListRow>) => {
      if (item.type === "section") {
        return (
          <Text
            accessibilityRole="header"
            className={`mb-3 text-[11px] font-semibold uppercase tracking-[1.6px] text-muted-foreground ${
              item.spacedTop ? "mt-3" : ""
            }`}
          >
            {item.label}
          </Text>
        );
      }
      return (
        <View className="flex-row items-start gap-2.5">
          {item.notes.map((note, i) =>
            note ? (
              <View key={note.id} className="flex-1">
                <NoteCard
                  note={note}
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
    [handleNotePress, viewMode]
  );

  const listEmpty = useMemo(
    () => (
      <View className="items-center gap-3 py-20">
        {archived ? <Archive size={40} color={colors.mutedForeground} /> : <FileText size={40} color={colors.mutedForeground} />}
        <Text className="text-sm text-muted-foreground">
          {searchQuery || kindFilter ? "No notes found" : (archived ? "No archived notes" : "No notes yet")}
        </Text>
      </View>
    ),
    [archived, colors.mutedForeground, searchQuery, kindFilter]
  );

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding" automaticOffset>
      <View className="w-full max-w-md self-center gap-4 px-5 max-[360px]:px-4 pt-4 pb-2">
        <View className="flex-row items-center justify-between gap-3">
          <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-medium text-foreground">
            {archived ? "Archive" : "My Notes"}
          </Text>
          <Pressable onPress={() => { Keyboard.dismiss(); setChooserVisible(false); setViewOptionsVisible(true); }}
            className="h-12 w-12 items-center justify-center rounded-full active:bg-card"
            accessibilityRole="button" accessibilityLabel="View options" accessibilityHint="Change layout and sort order"
            accessibilityState={{ expanded: viewOptionsVisible }}>
            <LayoutGrid size={24} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => { router.push("/(notes)/settings"); }}
            className="h-12 w-12 items-center justify-center rounded-full active:bg-card"
            accessibilityRole="button" accessibilityLabel="Settings">
            <Settings size={25} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View className="min-h-[48px] flex-row items-center gap-3 rounded-full bg-surface-container-high px-4">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={(v) => {
              setSearchQuery(v);
              searchRef.current = v;
              debouncedSearch(v);
            }}
            placeholder={archived ? "Search archive" : "Search notes"}
            accessibilityLabel={archived ? "Search archive" : "Search notes"}
            placeholderTextColor={colors.mutedForeground}
            className="min-h-[48px] min-w-0 flex-1 text-base text-foreground"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={clearSearch}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-70"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Clear"
            >
              <XCircle size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <View className="flex-row flex-wrap gap-2 pb-2">
          {FILTERS.map(option => (
            <Pressable key={option.kind ?? "all"} onPress={() => handleFilter(option.kind)}
              accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: kindFilter === option.kind }}
              className={`min-h-[48px] items-center justify-center rounded-[8px] border px-4 py-2 ${kindFilter === option.kind ? "border-transparent bg-secondary-container" : "border-outline"} active:opacity-70`}>
              <Text className={`text-sm font-medium ${kindFilter === option.kind ? "text-on-secondary-container" : "text-muted-foreground"}`}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        className="w-full max-w-md self-center"
        data={listData}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListEmptyComponent={loading ? <ActivityIndicator className="py-12" color={colors.primary} accessibilityLabel="Loading…" /> : loadFailed ? (
          <Pressable onPress={() => { void load(searchRef.current, sortRef.current); }} className="min-h-[44px] items-center justify-center rounded-xl bg-muted p-4 active:opacity-70" accessible accessibilityRole="button" accessibilityLabel="Retry">
            <Text className="text-foreground">Retry</Text>
          </Pressable>
        ) : listEmpty}
        onEndReached={() => { if (!loadFailed) void load(searchRef.current, sortRef.current, true); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={notes.length > 0 && loading ? <ActivityIndicator className="py-4" color={colors.primary} accessibilityLabel="Loading…" /> : notes.length > 0 && loadFailed ? (
          <Pressable onPress={() => { void load(searchRef.current, sortRef.current, true); }} className="min-h-[44px] items-center justify-center rounded-xl bg-muted p-4 active:opacity-70" accessible accessibilityRole="button" accessibilityLabel="Retry"><Text className="text-foreground">Retry</Text></Pressable>
        ) : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: archived ? 24 : 88 }]}
        style={styles.list}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
      />

      <FormDialog visible={viewOptionsVisible} title="View options" onClose={() => setViewOptionsVisible(false)}>
        <NotesDisplayOptions preferences={{ viewMode, sort }} disabled={!displayReady || savingDisplay}
          onChange={patch => { void changeDisplay(patch); }} />
      </FormDialog>

      {!archived && !keyboardVisible && chooserVisible && <Pressable
        onPress={closeChooser} accessible={false} style={StyleSheet.absoluteFill} />}

      {!archived && !keyboardVisible && <View pointerEvents="box-none" className="absolute bottom-4 w-full max-w-md self-center px-5">
        <NoteTypeChooser
          visible={chooserVisible}
          onClose={closeChooser}
          onSelect={handleSelectType}
        />
        <Pressable onPress={handleNew} className="h-14 w-14 self-end items-center justify-center rounded-2xl bg-primary-container shadow-md active:opacity-80"
          accessibilityRole="button"
          accessibilityState={{ expanded: chooserVisible }} accessibilityLabel={chooserVisible ? "Cancel" : "New Note"}>
          <Animated.View style={creationIconStyle}>
            <Plus size={24} color={colors.onPrimaryContainer} />
          </Animated.View>
        </Pressable>
      </View>}
    </KeyboardAvoidingView>
  );
}
