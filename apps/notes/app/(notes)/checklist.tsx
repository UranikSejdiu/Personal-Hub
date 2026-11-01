import { Text, TextInput } from "../../src/components/ui/Typography";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Keyboard, Pressable, View, type TextInputInstance as TextInputType } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState } from "react-native-keyboard-controller";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from "../../src/components/AppIcons";
import { useRouter, useLocalSearchParams, usePreventRemove } from "expo-router";
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
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { NoteActions } from "../../src/components/NoteActions";
import { NoteAttachments } from "../../src/components/NoteAttachments";
import { AttachmentToolbarButton } from "../../src/components/AttachmentToolbarButton";
import { FormattingIcon } from "../../src/components/FormattingIcon";
import { toolbarFeedback } from "../../src/lib/toolbarFeedback";
import { useNoteAttachments } from "../../src/lib/useNoteAttachments";
import { Checkbox } from "../../src/components/ui/Checkbox";
import {
  ChecklistItemRow,
  type ChecklistEntry,
} from "../../src/components/ChecklistItemRow";

type ConfirmState = { kind: "discard" } | { kind: "delete" } | null;
const AnimatedGestureScrollView = Animated.createAnimatedComponent(GestureScrollView);
const KeyboardGestureScrollView = forwardRef<Animated.ScrollView, ComponentProps<typeof Animated.ScrollView>>(
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
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const attachmentState = useNoteAttachments();
  const { initialize: initializeAttachments, hasChanges: attachmentsChanged, valueRef: attachmentsRef, busyRef: attachmentsBusyRef } = attachmentState;

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
  const isBusy = isSaving || isDragging || attachmentState.busy;
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const [removalAllowed, setRemovalAllowed] = useState(false);
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
        initializeAttachments(note.attachments ?? []);
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
  }, [loadTarget, router, t, initializeAttachments]);

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

    setItems((previous) => previous.filter((item) => item.key !== key));
  }, [isArchived]);

  const handleAddItem = useCallback(() => {
    if (isArchived || operationRef.current !== "idle") return;
    const key = `new-${keyCounterRef.current++}`;
    pendingFocusRef.current = key;

    setItems((previous) => [
      ...previous.filter((item) => !item.checked),
      { key, text: "", checked: false },
      ...previous.filter((item) => item.checked),
    ]);
  }, [isArchived]);

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
    if (attachmentsChanged()) return true;
    if (snapshotRef.current === null) return false;
    return serialize(titleRef.current, pinnedRef.current, itemsRef.current) !== snapshotRef.current;
  }, [isArchived, attachmentsChanged]);

  const pendingRemoveActionRef = useRef<(() => void) | null>(null);
  const checkingRemoveRef = useRef(false);
  const disableRemovalPrevention = usePreventRemove(!removalAllowed, ({ repeat }) => {
    if (operationRef.current !== "idle" || attachmentsBusyRef.current) return;
    if (checkingRemoveRef.current) return;
    checkingRemoveRef.current = true;
    if (!isDirtyNow()) {
      checkingRemoveRef.current = false;
      setRemovalAllowed(true);
      repeat();
      return;
    }
    checkingRemoveRef.current = false;
    pendingRemoveActionRef.current = () => {
      setRemovalAllowed(true);
      repeat();
    };
    setConfirmState({ kind: "discard" });
  });
  const allowRemoval = useCallback(() => {
    setRemovalAllowed(true);
    disableRemovalPrevention();
  }, [disableRemovalPrevention]);

  const handleConfirmDiscard = useCallback(() => {
    if (operationRef.current !== "idle") return;
    const pending = pendingRemoveActionRef.current;
    pendingRemoveActionRef.current = null;
    setConfirmState(null);
    if (pending) {
      pending();
    } else {
      allowRemoval();
      router.back();
    }
  }, [allowRemoval, router]);

  const persistNote = useCallback(async (archived?: boolean) => {
    if (isArchived || operationRef.current !== "idle" || loading || loadFailed || attachmentsBusyRef.current) return;
    operationRef.current = "saving";
    setIsSaving(true);
    const savedItems = itemsRef.current;
    const savedTitle = titleRef.current;
    const savedPinned = pinnedRef.current;
    try {
      const payload: NewChecklistItem[] = savedItems.map(({ text, checked }) => ({ text, checked }));
      if (noteId) {
        await saveChecklistNote(noteId, { title: savedTitle, is_pinned: savedPinned, is_archived: archived,
          attachments: attachmentsChanged() ? attachmentsRef.current : undefined }, payload);
      } else {
        const created = await createChecklistNote({ title: savedTitle, is_pinned: savedPinned, attachments: attachmentsRef.current }, payload);
        setNoteId(created.id);
      }
      snapshotRef.current = serialize(savedTitle, savedPinned, savedItems);
      allowRemoval();

      toast.success(t(archived === undefined ? "savedSuccess" : archived ? "notesArchived" : "notesUnarchived"));
      router.back();
    } catch {
      toast.error(t(archived === undefined ? "saveFailed" : "notesArchiveFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [allowRemoval, isArchived, loading, loadFailed, noteId, router, t, attachmentsRef, attachmentsBusyRef, attachmentsChanged]);

  const handleSave = useCallback(() => persistNote(), [persistNote]);
  const handleToggleArchive = useCallback(async () => {
    if (!isArchived) return persistNote(true);
    if (!noteId || operationRef.current !== "idle" || loading || loadFailed) return;
    operationRef.current = "saving";
    setIsSaving(true);
    try {
      await restoreNote(noteId);
      allowRemoval();

      toast.success(t("notesUnarchived"));
      router.back();
    } catch {
      toast.error(t("notesRestoreFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [allowRemoval, isArchived, loading, loadFailed, noteId, persistNote, router, t]);

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

      allowRemoval();
      router.back();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [allowRemoval, noteId, router, t]);

  const handleTogglePin = useCallback(() => {
    if (isArchived || operationRef.current !== "idle") return;

    pinnedRef.current = !pinnedRef.current;
    setIsPinned(pinnedRef.current);
  }, [isArchived]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ChecklistEntry>) => (
      <ScaleDecorator>
        <ChecklistItemRow
          item={item}
          grouped
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
          className="min-h-[44px] justify-center rounded-lg bg-primary px-4 max-[360px]:px-3 py-2 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t("cancel")}
        >
          <Text className="text-sm font-medium text-primary-foreground">{t("cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  const listFooter = (
    <View className="mx-5 max-[360px]:mx-4 px-2 pb-3">
      {!isArchived && <Pressable
        onPress={handleAddItem}
        disabled={isBusy}
        className="min-h-[44px] flex-row items-center gap-2 px-2 active:bg-muted"
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
            className="min-h-[44px] flex-row items-center gap-2 px-2 active:bg-muted"
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
                isArchived ? <ChecklistItemRow key={item.key} item={item} grouped readOnly disabled isActive={false}
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
      <Text className="mt-2 px-2 text-xs text-muted-foreground">{t("notesChecklistProgress", { completed: checkedItems.length, total: items.length })}</Text>
    </View>
  );

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-1 flex-col bg-background">
          <View className="w-full max-w-md flex-row items-center justify-between gap-3 self-center px-5 max-[360px]:px-4 pt-4 pb-5">
            <Pressable onPress={handleBack} disabled={isBusy} className="h-12 w-12 items-center justify-center rounded-full bg-foreground active:opacity-70 disabled:opacity-50"
              accessibilityRole="button" accessibilityLabel={t("navNotes")} accessibilityState={{ disabled: isBusy }}>
              <ArrowLeft size={22} color={colors.background} />
            </Pressable>
            <View className="flex-row flex-wrap justify-end gap-2">
              <NoteActions isPinned={isPinned} isArchived={isArchived} canDelete={noteId !== null} disabled={isBusy}
                onTogglePin={handleTogglePin} onDelete={handleDelete} onToggleArchive={handleToggleArchive} />
            </View>
          </View>

          {isArchived && <Text className="w-full max-w-md self-center px-4 max-[360px]:px-3 py-2 text-sm text-muted-foreground">{t("notesArchivedReadOnly")}</Text>}

          <DraggableFlatList
            className="w-full max-w-md self-center"
            data={activeItems}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            onDragBegin={handleDragBegin}
            onDragEnd={handleDragEnd}
            keyboardShouldPersistTaps="handled"
            renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} ScrollViewComponent={KeyboardGestureScrollView} bottomOffset={80} />}
            showsVerticalScrollIndicator={false}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 40 }}
            ListHeaderComponent={<View>
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
                className="mb-3 w-full px-5 max-[360px]:px-4 pt-2 pb-1 text-[32px] leading-[39px] font-semibold text-foreground"
                multiline
              />
              <View className="mx-5 max-[360px]:mx-4 mb-5 mt-3 flex-row flex-wrap items-center justify-between gap-3">
                <View className="rounded-full bg-primary/10 px-4 py-2">
                  <Text className="text-xs font-semibold text-primary">{t(isArchived ? "notesArchivedStatus" : "notesChecklistStatus")}</Text>
                </View>
                {!isArchived && <Pressable onPress={handleSave} disabled={isBusy}
                  className="min-h-[48px] items-center justify-center rounded-full bg-primary px-5 py-2 disabled:opacity-50"
                  accessibilityRole="button" accessibilityLabel={t("save")} accessibilityState={{ disabled: isBusy, busy: isSaving }}>
                  <Text accessibilityLiveRegion="polite" className="text-sm font-semibold text-primary-foreground">{t(isSaving ? "saving" : "save")}</Text>
                </Pressable>}
              </View>
              <NoteAttachments state={attachmentState} readOnly={isArchived} disabled={isBusy} />
              <View className="mx-5 max-[360px]:mx-4 h-2" />
            </View>}
            ListFooterComponent={listFooter}
          />
          {!isArchived && <KeyboardStickyView className="w-full border-t border-border/60 bg-card"
            style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
            <View className="w-full max-w-md flex-row items-center justify-between self-center px-3 py-2">
              <AttachmentToolbarButton disabled={isBusy} busy={attachmentState.busy}
                onSelect={kind => { void attachmentState.actionRef.current?.add(kind); }} />
              <Pressable onPress={() => { toolbarFeedback(); Keyboard.dismiss(); }} disabled={isBusy}
                accessibilityRole="button" accessibilityLabel={t("notesDone")} accessibilityHint={t("notesDoneHint")}
                className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-full bg-primary px-3 active:opacity-80 disabled:opacity-50">
                <FormattingIcon name="done" size={20} color={colors.primaryForeground} />
                <Text className="text-sm font-semibold text-primary-foreground">{t("notesDone")}</Text>
              </Pressable>
            </View>
          </KeyboardStickyView>}
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
