import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
  type ScrollView as ScrollViewType,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from "../../src/components/AppIcons";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import {
  getNote,
  getChecklistItems,
  createChecklistNote,
  saveChecklistNote,
  deleteNote,
  restoreNote,
  type NewChecklistItem,
} from "../../src/lib/notes";
import { useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { NoteActions } from "../../src/components/NoteActions";
import { Checkbox } from "../../src/components/ui/Checkbox";
import {
  ChecklistItemRow,
  type ChecklistEntry,
} from "../../src/components/ChecklistItemRow";

type ConfirmState = { kind: "discard" } | { kind: "delete" } | null;
const AnimatedGestureScrollView = Animated.createAnimatedComponent(GestureScrollView);
const KeyboardGestureScrollView = forwardRef<ScrollViewType, ComponentProps<typeof Animated.ScrollView>>(
  function KeyboardGestureScrollView(props, ref) {
    return <AnimatedGestureScrollView {...props} ref={ref} />;
  }
);

type LoadTarget =
  | { kind: "new" }
  | { kind: "invalid" }
  | { kind: "note"; id: number };

function serialize(title: string, pinned: boolean, items: ChecklistEntry[]): string {
  return JSON.stringify({
    title,
    pinned,
    items: items.map((item) => ({ text: item.text, checked: item.checked })),
  });
}

export default function ChecklistEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const loadTarget = useMemo<LoadTarget>(() => {
    if (id == null || id === "") return { kind: "new" };
    const parsed = Number(id);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return { kind: "invalid" };
    return { kind: "note", id: parsed };
  }, [id]);

  const [noteId, setNoteId] = useState<number | null>(() =>
    loadTarget.kind === "note" ? loadTarget.id : null
  );
  const [title, setTitle] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [items, setItems] = useState<ChecklistEntry[]>([]);
  const [checkedExpanded, setCheckedExpanded] = useState(false);
  const [loading, setLoading] = useState(() => loadTarget.kind === "note");
  const [asyncLoadFailed, setAsyncLoadFailed] = useState(false);
  const loadFailed = loadTarget.kind === "invalid" || asyncLoadFailed;
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // A ref closes the interval before React commits the disabled controls.
  const operationRef = useRef<"idle" | "dragging" | "saving" | "deleting">("idle");
  const isBusy = isSaving || isDragging;
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const allowRemoveRef = useRef(false);
  const snapshotRef = useRef<string | null>(null);
  const keyCounterRef = useRef(0);
  const inputRefs = useRef(new Map<string, TextInputType>());
  const pendingFocusRef = useRef<string | null>(null);
  const titleRef = useRef(title);
  const pinnedRef = useRef(isPinned);
  const itemsRef = useRef(items);

  useEffect(() => {
    titleRef.current = title;
    pinnedRef.current = isPinned;
    itemsRef.current = items;
  }, [title, isPinned, items]);

  // Establish the baseline for a brand new note so leaving an untouched
  // checklist never triggers the discard prompt.
  useEffect(() => {
    if (loadTarget.kind === "new" && snapshotRef.current === null) {
      snapshotRef.current = serialize("", false, []);
    }
  }, [loadTarget]);

  useEffect(() => {
    if (loadTarget.kind !== "note") return;
    let cancelled = false;
    snapshotRef.current = null;
    Promise.all([getNote(loadTarget.id), getChecklistItems(loadTarget.id)])
      .then(([note, noteItems]) => {
        if (cancelled) return;
        if (!note) {
          setAsyncLoadFailed(true);
          setLoading(false);
          return;
        }
        if (note.kind !== "checklist") {
          // A text note can only reach this route through a stale link; send
          // it to the editor that actually owns its content.
          router.replace({ pathname: "/(notes)/editor", params: { id: String(note.id) } });
          return;
        }
        const entries = noteItems.map<ChecklistEntry>((item) => ({
          key: `item-${item.id}`,
          text: item.text,
          checked: item.checked,
        }));
        setNoteId(note.id);
        setTitle(note.title);
        setIsPinned(note.is_pinned);
        setIsArchived(note.is_archived);
        setItems(entries);
        snapshotRef.current = serialize(note.title, note.is_pinned, entries);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setAsyncLoadFailed(true);
        toast.error(t("errorLoadingData"));
      });
    return () => {
      cancelled = true;
    };
  }, [loadTarget, router, t]);

  const activeItems = useMemo(() => items.filter((item) => !item.checked), [items]);
  const checkedItems = useMemo(() => items.filter((item) => item.checked), [items]);

  const registerInput = useCallback((key: string, ref: TextInputType | null) => {
    if (ref) {
      inputRefs.current.set(key, ref);
      if (pendingFocusRef.current === key) {
        pendingFocusRef.current = null;
        ref.focus();
      }
    } else {
      inputRefs.current.delete(key);
    }
  }, []);

  const handleToggle = useCallback((key: string) => {
    if (isArchived || operationRef.current !== "idle") return;
    setItems((previous) => {
      const toggled = previous.map((item) =>
        item.key === key ? { ...item, checked: !item.checked } : item
      );
      // Keep the invariant that active items precede checked ones.
      return [...toggled.filter((item) => !item.checked), ...toggled.filter((item) => item.checked)];
    });
  }, [isArchived]);

  const handleChangeText = useCallback((key: string, text: string) => {
    if (isArchived || operationRef.current !== "idle") return;
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, text } : item))
    );
  }, [isArchived]);

  const handleRemove = useCallback((key: string) => {
    if (isArchived || operationRef.current !== "idle") return;
    void haptics.light();
    setItems((previous) => previous.filter((item) => item.key !== key));
  }, [haptics, isArchived]);

  const handleAddItem = useCallback(() => {
    if (isArchived || operationRef.current !== "idle") return;
    const key = `new-${keyCounterRef.current++}`;
    pendingFocusRef.current = key;
    void haptics.light();
    setItems((previous) => [
      ...previous.filter((item) => !item.checked),
      { key, text: "", checked: false },
      ...previous.filter((item) => item.checked),
    ]);
  }, [haptics, isArchived]);

  const handleDragBegin = useCallback(() => {
    if (isArchived || operationRef.current !== "idle") return;
    operationRef.current = "dragging";
    setIsDragging(true);
  }, [isArchived]);

  const handleDragEnd = useCallback(
    ({ data }: { data: ChecklistEntry[] }) => {
      if (operationRef.current !== "dragging") return;
      const reordered = [...data, ...itemsRef.current.filter((item) => item.checked)];
      itemsRef.current = reordered;
      setItems(reordered);
      // onRelease precedes the drop animation; only onDragEnd has the final order.
      operationRef.current = "idle";
      setIsDragging(false);
    },
    []
  );

  const handleBack = useCallback(() => {
    if (operationRef.current !== "idle") return;
    router.back();
  }, [router]);

  const isDirtyNow = useCallback((): boolean => {
    if (isArchived) return false;
    if (snapshotRef.current === null) return false;
    return serialize(titleRef.current, pinnedRef.current, itemsRef.current) !== snapshotRef.current;
  }, [isArchived]);

  const pendingRemoveActionRef = useRef<(() => void) | null>(null);
  const checkingRemoveRef = useRef(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (event: {
        preventDefault: () => void;
        data: { action: { type: string } };
      }) => {
        if (allowRemoveRef.current) return;
        event.preventDefault();
        if (operationRef.current !== "idle") return;
        if (checkingRemoveRef.current) return;
        const action = event.data.action;
        checkingRemoveRef.current = true;
        if (!isDirtyNow()) {
          checkingRemoveRef.current = false;
          allowRemoveRef.current = true;
          navigation.dispatch(action as never);
          return;
        }
        checkingRemoveRef.current = false;
        pendingRemoveActionRef.current = () => {
          allowRemoveRef.current = true;
          navigation.dispatch(action as never);
        };
        setConfirmState({ kind: "discard" });
      }
    );
    return unsubscribe;
  }, [isDirtyNow, navigation]);

  const handleConfirmDiscard = useCallback(() => {
    if (operationRef.current !== "idle") return;
    const pending = pendingRemoveActionRef.current;
    pendingRemoveActionRef.current = null;
    setConfirmState(null);
    if (pending) {
      pending();
    } else {
      allowRemoveRef.current = true;
      router.back();
    }
  }, [router]);

  const persistNote = useCallback(async (archived?: boolean) => {
    if (isArchived || operationRef.current !== "idle" || loading || loadFailed) return;
    operationRef.current = "saving";
    setIsSaving(true);
    const savedItems = itemsRef.current;
    const savedTitle = titleRef.current;
    const savedPinned = pinnedRef.current;
    try {
      const payload: NewChecklistItem[] = savedItems.map(({ text, checked }) => ({ text, checked }));
      if (noteId) {
        await saveChecklistNote(noteId, { title: savedTitle, is_pinned: savedPinned, is_archived: archived }, payload);
      } else {
        const created = await createChecklistNote({ title: savedTitle, is_pinned: savedPinned }, payload);
        setNoteId(created.id);
      }
      snapshotRef.current = serialize(savedTitle, savedPinned, savedItems);
      allowRemoveRef.current = true;
      void haptics.success();
      toast.success(t(archived === undefined ? "savedSuccess" : archived ? "notesArchived" : "notesUnarchived"));
      router.back();
    } catch {
      toast.error(t(archived === undefined ? "saveFailed" : "notesArchiveFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [haptics, isArchived, loading, loadFailed, noteId, router, t]);

  const handleSave = useCallback(() => persistNote(), [persistNote]);
  const handleToggleArchive = useCallback(async () => {
    if (!isArchived) return persistNote(true);
    if (!noteId || operationRef.current !== "idle" || loading || loadFailed) return;
    operationRef.current = "saving";
    setIsSaving(true);
    try {
      await restoreNote(noteId);
      allowRemoveRef.current = true;
      void haptics.success();
      toast.success(t("notesUnarchived"));
      router.back();
    } catch {
      toast.error(t("notesRestoreFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [haptics, isArchived, loading, loadFailed, noteId, persistNote, router, t]);

  const handleDelete = useCallback(() => {
    if (operationRef.current !== "idle") return;
    if (noteId) setConfirmState({ kind: "delete" });
  }, [noteId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!noteId || operationRef.current !== "idle") return;
    operationRef.current = "deleting";
    setIsSaving(true);
    setConfirmState(null);
    try {
      await deleteNote(noteId);
      void haptics.light();
      allowRemoveRef.current = true;
      router.back();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [haptics, noteId, router, t]);

  const handleTogglePin = useCallback(() => {
    if (isArchived || operationRef.current !== "idle") return;
    void haptics.light();
    pinnedRef.current = !pinnedRef.current;
    setIsPinned(pinnedRef.current);
  }, [haptics, isArchived]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ChecklistEntry>) => (
      <ScaleDecorator>
        <ChecklistItemRow
          item={item}
          readOnly={isArchived}
          disabled={isArchived || isBusy}
          isActive={isActive}
          drag={drag}
          onToggle={handleToggle}
          onChangeText={handleChangeText}
          onRemove={handleRemove}
          registerInput={registerInput}
        />
      </ScaleDecorator>
    ),
    [handleChangeText, handleRemove, handleToggle, isArchived, isBusy, registerInput]
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
      </View>
    );
  }

  if (loadFailed) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <Text className="text-sm text-muted-foreground">{t("errorLoadingData")}</Text>
        <Pressable
          onPress={() => router.back()}
          className="min-h-[44px] justify-center rounded-lg bg-primary px-4 py-2 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t("cancel")}
        >
          <Text className="text-sm font-medium text-primary-foreground">{t("cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  const listFooter = (
    <View>
      {!isArchived && <Pressable
        onPress={handleAddItem}
        disabled={isBusy}
        className="min-h-[44px] flex-row items-center gap-2 px-4 active:bg-muted"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("notesAddItem")}
        accessibilityState={{ disabled: isBusy }}
      >
        <Plus size={16} color={colors.mutedForeground} />
        <Text className="text-sm text-muted-foreground">{t("notesAddItem")}</Text>
      </Pressable>}

      {checkedItems.length > 0 ? (
        <View className="mt-2">
          <Pressable
            onPress={() => setCheckedExpanded((previous) => !previous)}
            className="min-h-[44px] flex-row items-center gap-2 px-4 active:bg-muted"
            accessible
            accessibilityRole="button"
            accessibilityState={{ expanded: checkedExpanded }}
            accessibilityLabel={
              checkedItems.length === 1
                ? t("notesCheckedItems", { count: checkedItems.length })
                : t("notesCheckedItemsPlural", { count: checkedItems.length })
            }
          >
            {checkedExpanded ? (
              <ChevronDown size={18} color={colors.mutedForeground} />
            ) : (
              <ChevronRight size={18} color={colors.mutedForeground} />
            )}
            <Text className="text-sm text-muted-foreground">
              {checkedItems.length === 1
                ? t("notesCheckedItems", { count: checkedItems.length })
                : t("notesCheckedItemsPlural", { count: checkedItems.length })}
            </Text>
          </Pressable>

          {checkedExpanded
            ? checkedItems.map((item) => (
                isArchived ? <ChecklistItemRow key={item.key} item={item} readOnly disabled isActive={false}
                  drag={() => {}} onToggle={handleToggle} onChangeText={handleChangeText}
                  onRemove={handleRemove} registerInput={registerInput} /> : <View key={item.key} className="flex-row items-center gap-1 px-3">
                  <Checkbox checked
                    onPress={() => handleToggle(item.key)}
                    disabled={isBusy}
                    className="h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
                    accessibilityLabel={item.text || t("notesItemPlaceholder")}
                  />
                  <Text className="flex-1 py-2 text-base text-muted-foreground line-through">
                    {item.text || t("notesItemPlaceholder")}
                  </Text>
                  <Pressable
                    onPress={() => handleRemove(item.key)}
                    disabled={isBusy}
                    className="h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={t("notesItemDelete")}
                    accessibilityState={{ disabled: isBusy }}
                  >
                    <X size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-1 flex-col bg-background">
          <View className="w-full max-w-md flex-row items-center justify-between self-center px-4 pt-3 pb-1">
            <Pressable
              onPress={handleBack}
              disabled={isBusy}
              className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t("cancel")}
              accessibilityState={{ disabled: isBusy }}
            >
              <ArrowLeft size={24} color={colors.foreground} />
            </Pressable>
            <View className="flex-row items-center gap-2">
              <NoteActions isPinned={isPinned} isArchived={isArchived} canDelete={noteId !== null} disabled={isBusy}
                onTogglePin={handleTogglePin} onDelete={handleDelete} onToggleArchive={handleToggleArchive} />
              {!isArchived && <Pressable
                onPress={handleSave}
                disabled={isBusy}
                className={`min-h-[44px] items-center justify-center rounded-lg px-4 py-2 active:opacity-70 ${!isBusy ? "bg-primary" : "bg-primary/50"}`}
                accessibilityRole="button"
                accessibilityLabel={t("save")}
                accessibilityState={{ disabled: isBusy, busy: isSaving }}
              >
                <Text accessibilityLiveRegion="polite" className="text-sm font-medium text-primary-foreground">
                  {t(isSaving ? "saving" : "save")}
                </Text>
              </Pressable>}
            </View>
          </View>

          {isArchived && <Text className="w-full max-w-md self-center px-4 py-2 text-sm text-muted-foreground">{t("notesArchivedReadOnly")}</Text>}

          <DraggableFlatList
            className="w-full max-w-md self-center"
            data={activeItems}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            onDragBegin={handleDragBegin}
            onDragEnd={handleDragEnd}
            keyboardShouldPersistTaps="handled"
            renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} ScrollViewComponent={KeyboardGestureScrollView} bottomOffset={16} />}
            showsVerticalScrollIndicator={false}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(24, insets.bottom + 16) }}
            ListHeaderComponent={
              <TextInput
                value={title}
                editable={!isArchived && !isBusy}
                onChangeText={(value) => {
                  if (isArchived || operationRef.current !== "idle") return;
                  titleRef.current = value;
                  setTitle(value);
                }}
                placeholder={t("notesUntitled")}
                placeholderTextColor={colors.mutedForeground}
                className="mb-3 w-full px-4 pt-2 pb-1 text-2xl font-bold text-foreground"
                multiline
              />
            }
            ListFooterComponent={listFooter}
          />
        </View>
      </View>

      <ConfirmDialog
        visible={confirmState !== null}
        title={confirmState?.kind === "delete" ? t("notesDelete") : t("discardChangesTitle")}
        message={confirmState?.kind === "delete" ? t("notesDeleteConfirm") : t("notesUnsavedChanges")}
        confirmLabel={
          confirmState?.kind === "delete" ? t("delete") : confirmState?.kind === "discard" ? t("discard") : t("confirm")
        }
        cancelLabel={t("cancel")}
        destructive={confirmState?.kind === "delete"}
        onClose={() => {
          pendingRemoveActionRef.current = null;
          setConfirmState(null);
        }}
        onConfirm={confirmState?.kind === "delete" ? handleConfirmDelete : handleConfirmDiscard}
      />
    </>
  );
}
