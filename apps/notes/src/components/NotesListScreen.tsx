import { Text, TextInput } from "./ui/Typography";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Pressable, ActivityIndicator, Keyboard, StyleSheet, useWindowDimensions } from "react-native";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { Archive, FileText, LayoutGrid, Plus, Search, X, XCircle } from "./AppIcons";
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
import { listDrafts, discardDraft, type DraftSummary } from "../lib/noteDrafts";
import { ConfirmDialog } from "./ConfirmDialog";
import { NoteCard } from "./NoteCard";
import { NoteTypeChooser } from "./NoteTypeChooser";
import { NotesDisplayOptions } from "./NotesDisplayOptions";
import { FormDialog } from "./ui/FormDialog";
import { Button, IconButton } from "./ui/Button";
import { useThemeColors } from "../lib/theme";
import { usePageMargins } from "../lib/usePageMargins";
import type { NoteKind } from "../types/notes";

const styles = StyleSheet.create({
  listContent: { paddingTop: 4 },
  gridList: { marginHorizontal: -4 },
  gridInset: { paddingHorizontal: 4 },
});

const FILTERS: { kind: NoteKind | undefined; label: string }[] = [
  { kind: undefined, label: "All notes" },
  { kind: "text", label: "Notes" },
  { kind: "checklist", label: "Checklists" },
];

type NotesListRow =
  | { type: "section"; key: string; label: string }
  | { type: "note"; key: string; note: Note; first: boolean; last: boolean };

export default function NotesListScreen({ archived = false }: { archived?: boolean }) {
  const router = useRouter();
  const colors = useThemeColors();
  const { width, fontScale } = useWindowDimensions();
  const pageMargins = usePageMargins();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [discarding, setDiscarding] = useState<DraftSummary | null>(null);
  const [draftError, setDraftError] = useState("");
  const draftRequest = useRef(0);
  const refreshDrafts = useCallback(async () => {
    const request = ++draftRequest.current;
    try {
      const rows = await listDrafts();
      if (draftRequest.current === request) { setDrafts(rows); setDraftError(""); }
    } catch {
      if (draftRequest.current === request) setDraftError("Could not load recovery drafts.");
    }
  }, []);
  useFocusEffect(useCallback(() => {
    if (!archived) void refreshDrafts();
    return () => { ++draftRequest.current; };
  }, [archived, refreshDrafts]));
  const discard = async () => {
    if (!discarding) return;
    ++draftRequest.current;
    await discardDraft(discarding.draft_key);
    setDrafts(current => current.filter(row => row.draft_key !== discarding.draft_key));
    setDiscarding(null);
  };
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
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
      router.push({ pathname: kind === "checklist" ? "/(notes)/checklist" : "/(notes)/editor",
        params: { draftKey: `${kind}:new-${Date.now()}` } });
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

  // Keep a readable column width as the device or its text size changes.
  const layout = viewMode === "grid" && (width - pageMargins.marginLeft - pageMargins.marginRight) / fontScale >= 336 ? "grid" : "list";
  const gridInset = layout === "grid" ? styles.gridInset : undefined;
  const listData = useMemo<NotesListRow[]>(() => {
    const data: NotesListRow[] = [];
    const appendRows = (group: Note[]) => {
      group.forEach((note, i) => data.push({
        type: "note", key: String(note.id), note, first: i === 0, last: i === group.length - 1,
      }));
    };
    const pinned = archived ? [] : notes.filter(note => note.is_pinned);
    if (pinned.length) {
      data.push({ type: "section", key: "section-pinned", label: "Pinned" });
      appendRows(pinned);
      if (pinned.length < notes.length) {
        data.push({ type: "section", key: "section-other", label: "Other notes" });
        appendRows(notes.filter(note => !note.is_pinned));
      }
    } else {
      appendRows(notes);
    }
    return data;
  }, [archived, notes]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<NotesListRow>) => {
      if (item.type === "section") {
        return (
          <Text
            accessibilityRole="header"
            style={gridInset}
            className="mb-2 text-label-medium font-semibold text-muted-foreground"
          >
            {item.label}
          </Text>
        );
      }
      return (
        <View style={gridInset}>
          <NoteCard note={item.note} layout={layout} first={item.first} last={item.last} onPress={handleNotePress} />
        </View>
      );
    },
    [handleNotePress, layout, gridInset]
  );

  const listEmpty = useMemo(
    () => (
      <View className="items-center gap-2.5 rounded-[24px] border border-border bg-surface px-4 py-8">
        {archived ? <Archive size={28} color={colors.mutedForeground} /> : <FileText size={28} color={colors.mutedForeground} />}
        <Text className="text-sm text-muted-foreground">
          {searchQuery || kindFilter ? "No notes found" : (archived ? "No archived notes" : "No notes yet")}
        </Text>
      </View>
    ),
    [archived, colors.mutedForeground, searchQuery, kindFilter]
  );

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior="padding" automaticOffset style={pageMargins}>
      <View className="gap-3 pb-3 pt-4">
        <View className="min-h-[48px] flex-row items-center gap-1">
          <Text accessibilityRole="header" className="min-w-0 flex-1 text-2xl font-semibold text-foreground">
            {archived ? "Archive" : "My Notes"}
          </Text>
          <IconButton icon={searchVisible ? X : Search} selected={searchVisible}
            accessibilityLabel={searchVisible ? "Close search" : archived ? "Search archive" : "Search notes"}
            accessibilityState={{ expanded: searchVisible }} className="border border-border bg-surface"
            onPress={() => {
              setChooserVisible(false);
              if (searchVisible) { Keyboard.dismiss(); clearSearch(); }
              setSearchVisible(!searchVisible);
            }} />
          <IconButton icon={LayoutGrid} onPress={() => { Keyboard.dismiss(); setChooserVisible(false); setViewOptionsVisible(true); }}
            className="border border-border bg-surface" accessibilityLabel="View options"
            accessibilityHint="Change layout and sort order" accessibilityState={{ expanded: viewOptionsVisible }} />
        </View>

        {searchVisible && <View className="min-h-[48px] flex-row items-center gap-2 rounded-full border border-border bg-surface px-4">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            autoFocus
            value={searchQuery}
            onChangeText={(v) => {
              setSearchQuery(v);
              searchRef.current = v;
              debouncedSearch(v);
            }}
            placeholder={archived ? "Search archive" : "Search notes"}
            accessibilityLabel={archived ? "Search archive" : "Search notes"}
            placeholderTextColor={colors.mutedForeground}
            className="min-h-[48px] min-w-0 flex-1 text-body-medium text-foreground"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={clearSearch}
              className="h-12 w-12 items-center justify-center rounded-full active:opacity-70"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Clear"
            >
              <XCircle size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>}
        <View className="flex-row flex-wrap gap-2">
          {FILTERS.map(option => (
            <Pressable key={option.kind ?? "all"} onPress={() => handleFilter(option.kind)}
              accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: kindFilter === option.kind }}
              className={`min-h-[48px] max-w-full justify-center rounded-full border px-3.5 py-2 active:opacity-70 ${kindFilter === option.kind ? "border-transparent bg-secondary-container" : "border-border bg-surface"}`}>
              <Text className={`shrink text-center text-label-medium ${kindFilter === option.kind ? "font-semibold text-on-secondary-container" : "font-medium text-muted-foreground"}`}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="flex-1" style={layout === "grid" ? styles.gridList : undefined}>
        <FlashList
          key={layout}
          masonry={layout === "grid"}
          numColumns={layout === "grid" ? 2 : 1}
          optimizeItemArrangement
          overrideItemLayout={(cell, item, _index, columns) => { cell.span = item.type === "section" ? columns : 1; }}
          getItemType={item => item.type}
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          ListHeaderComponentStyle={gridInset}
          ListFooterComponentStyle={gridInset}
          ListHeaderComponent={archived ? undefined : <>
            {draftError && <Button variant="secondary" label={draftError + " Retry"} onPress={() => { void refreshDrafts(); }} />}
            {drafts.map(row => <View key={row.draft_key} className="mb-3 gap-2 rounded-[24px] border border-border bg-surface p-4">
              <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
                {row.title || (row.kind === "text" ? "Untitled note" : "Untitled checklist")}
              </Text>
              <Text className="text-sm text-muted-foreground">Unsaved draft</Text>
              <View className="flex-row flex-wrap gap-2">
                <Button label="Resume draft" onPress={() => router.push({ pathname: row.kind === "text" ? "/(notes)/editor" : "/(notes)/checklist",
                  params: row.note_id ? { id: String(row.note_id) } : { draftKey: row.draft_key } })} />
                <Button label="Discard" variant="text" onPress={() => setDiscarding(row)} />
              </View>
            </View>)}
          </>}
          ListEmptyComponent={loading ? <ActivityIndicator className="py-12" color={colors.primary} accessibilityLabel="Loading…" /> : loadFailed ? (
            <Button label="Retry" variant="secondary" onPress={() => { void load(searchRef.current, sortRef.current); }} />
          ) : <View style={gridInset}>{listEmpty}</View>}
          onEndReached={() => { if (!loadFailed) void load(searchRef.current, sortRef.current, true); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={notes.length > 0 && loading ? <ActivityIndicator className="py-4" color={colors.primary} accessibilityLabel="Loading…" /> : notes.length > 0 && loadFailed ? (
            <Button label="Retry" variant="secondary" onPress={() => { void load(searchRef.current, sortRef.current, true); }} />
          ) : undefined}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: archived ? 16 : 76 }]}
        />
      </View>

      <ConfirmDialog visible={discarding !== null} destructive title="Discard draft?"
        message={discarding?.note_id ? "Discard these edits and keep the saved note?" : "Discard this unsaved draft and its attachments?"}
        confirmLabel="Discard" cancelLabel="Keep draft" onConfirm={discard} onClose={() => setDiscarding(null)} />

      <FormDialog visible={viewOptionsVisible} title="View options" onClose={() => setViewOptionsVisible(false)}>
        <NotesDisplayOptions preferences={{ viewMode, sort }} disabled={!displayReady || savingDisplay}
          onChange={patch => { void changeDisplay(patch); }} />
      </FormDialog>

      {!archived && !keyboardVisible && chooserVisible && <Pressable
        onPress={closeChooser} accessible={false} style={StyleSheet.absoluteFill} />}

      {!archived && !keyboardVisible && <View pointerEvents="box-none" className="absolute inset-x-0 bottom-3">
        <NoteTypeChooser
          visible={chooserVisible}
          onClose={closeChooser}
          onSelect={handleSelectType}
        />
        <Pressable onPress={handleNew} className="h-14 w-14 self-end items-center justify-center rounded-full bg-primary active:opacity-80"
          accessibilityRole="button"
          accessibilityState={{ expanded: chooserVisible }} accessibilityLabel={chooserVisible ? "Cancel" : "New Note"}>
          <Animated.View style={creationIconStyle}>
            <Plus size={24} color={colors.primaryForeground} />
          </Animated.View>
        </Pressable>
      </View>}
    </KeyboardAvoidingView>
  );
}
