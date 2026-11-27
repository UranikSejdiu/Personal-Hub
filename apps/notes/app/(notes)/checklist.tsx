import { draftSession } from "../../src/lib/noteDrafts";
import { Text, TextInput } from "../../src/components/ui/Typography";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Keyboard, Pressable, View, type TextInputInstance as TextInputType } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState } from "react-native-keyboard-controller";
import { ScrollView as GestureScrollView } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePageMargins } from "../../src/lib/usePageMargins";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, X } from "../../src/components/AppIcons";
import { useRouter, useLocalSearchParams, usePreventRemove } from "expo-router";
import { toast } from "sonner-native";
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
  const { id, draftKey } = useLocalSearchParams<{ id?: string; draftKey?: string }>();
  return <ChecklistEditor key={id ?? draftKey ?? "new"} id={id} draftKey={draftKey} />;
}

function ChecklistEditor({ id, draftKey }: { id?: string; draftKey?: string }) {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const pageMargins = usePageMargins();
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const attachmentState = useNoteAttachments();
  const { initialize: initializeAttachments, onChange: changeAttachments, hasChanges: attachmentsChanged, valueRef: attachmentsRef, busyRef: attachmentsBusyRef } = attachmentState;

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
  const [loading, setLoading] = useState(loadTarget.kind !== "invalid");
  const [asyncLoadFailed, setAsyncLoadFailed] = useState(false);
  const loadFailed = loadTarget.kind === "invalid" || asyncLoadFailed;
  const draft = useMemo(() => draftSession("checklist", loadTarget.kind === "note" ? loadTarget.id : null, draftKey), [loadTarget, draftKey]);
  const [saveError, setSaveError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftRetry, setDraftRetry] = useState(0);
  const hadDraft = useRef(false);
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
    if (loadTarget.kind === "invalid") return;
    let cancelled = false;
    const existingId = loadTarget.kind === "note" ? loadTarget.id : null;
    Promise.all([existingId ? getNote(existingId) : undefined, draft.read(), existingId ? getChecklistItems(existingId) : []])
      .then(([note, recovery, noteItems]) => {
        if (cancelled) return;
        if (existingId && !note) { setAsyncLoadFailed(true); setLoading(false); return; }
        if (note && note.kind !== "checklist") {
          router.replace({ pathname: "/(notes)/editor", params: { id: String(note.id) } });
          return;
        }
        const restored = note?.is_archived ? undefined : recovery;
        hadDraft.current = Boolean(restored);
        setNoteId(existingId);
        setTitle(restored?.title ?? note?.title ?? "");
        setIsPinned(restored?.pinned ?? note?.is_pinned ?? false);
        setIsArchived(note?.is_archived ?? false);
        initializeAttachments(note?.attachments ?? []);
        if (restored) changeAttachments(restored.attachments);
        const original = noteItems.map(item => ({ key: `item-${item.id}`, text: item.text, checked: item.checked }));
        snapshotRef.current = serialize(note?.title ?? "", note?.is_pinned ?? false, original);
        const recovered: NewChecklistItem[] | undefined = restored && JSON.parse(restored.body);
        setItems(recovered?.map((item, index) => ({ ...item, key: `restored-${index}` })) ?? original);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setAsyncLoadFailed(true);
        toast.error("Failed to load data.");
      });
    return () => {
      cancelled = true;
    };
  }, [draft, loadTarget, router, initializeAttachments, changeAttachments]);

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

  useEffect(() => {
    if (loading || loadFailed || isArchived) return;
    const dirty = serialize(title, isPinned, items) !== snapshotRef.current || attachmentsChanged();
    if (!dirty && !hadDraft.current) return;
    hadDraft.current = dirty;
    let active = true;
    void draft.write(dirty ? { title, pinned: isPinned, body: JSON.stringify(items.map(({ text, checked }) => ({ text, checked }))), attachments: attachmentState.attachments } : null)
      .then(() => { if (active) setDraftError(""); })
      .catch(() => { if (active) { hadDraft.current = true; setDraftError("Draft recovery could not be updated."); } });
    return () => { active = false; };
  }, [draft, draftRetry, loading, loadFailed, isArchived, title, isPinned, attachmentState.attachments, attachmentsChanged, items]);

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

  const handleConfirmDiscard = useCallback(async () => {
    if (operationRef.current !== "idle") return;
    try { await draft.finish(async () => {}); }
    catch { setSaveError("Could not discard the draft. Try again."); setConfirmState(null); return; }
    const pending = pendingRemoveActionRef.current;
    pendingRemoveActionRef.current = null;
    setConfirmState(null);
    if (pending) {
      pending();
    } else {
      allowRemoval();
      router.back();
    }
  }, [allowRemoval, router, draft]);

  const persistNote = useCallback(async (archived?: boolean) => {
    if (isArchived || operationRef.current !== "idle" || loading || loadFailed || attachmentsBusyRef.current) return;
    operationRef.current = "saving";
    setIsSaving(true);
    const savedItems = itemsRef.current;
    const savedTitle = titleRef.current;
    const savedPinned = pinnedRef.current;
    try {
      const payload: NewChecklistItem[] = savedItems.map(({ text, checked }) => ({ text, checked }));
      await draft.finish(async tx => {
        if (noteId) {
          await saveChecklistNote(noteId, { title: savedTitle, is_pinned: savedPinned, is_archived: archived,
            attachments: attachmentsChanged() ? attachmentsRef.current : undefined }, payload, tx);
        } else {
          await createChecklistNote({ title: savedTitle, is_pinned: savedPinned, attachments: attachmentsRef.current }, payload, tx);
        }
      });
      snapshotRef.current = serialize(savedTitle, savedPinned, savedItems);
      allowRemoval();

      toast.success(archived === undefined ? "Saved successfully" : archived ? "Note archived" : "Note restored to Notes");
      router.back();
    } catch {
      setSaveError(archived === undefined ? "Could not save your changes. Tap Save to retry." : "Could not archive this note. Try Archive again.");
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [allowRemoval, isArchived, loading, loadFailed, noteId, router, attachmentsRef, attachmentsBusyRef, attachmentsChanged, draft]);

  const handleSave = useCallback(() => persistNote(), [persistNote]);
  const handleToggleArchive = useCallback(async () => {
    if (!isArchived) return persistNote(true);
    if (!noteId || operationRef.current !== "idle" || loading || loadFailed) return;
    operationRef.current = "saving";
    setIsSaving(true);
    try {
      await restoreNote(noteId);
      allowRemoval();

      toast.success("Note restored to Notes");
      router.back();
    } catch {
      setSaveError("Could not restore the note. Please try again.");
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [allowRemoval, isArchived, loading, loadFailed, noteId, persistNote, router]);

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
      await draft.finish(tx => deleteNote(noteId, tx));

      allowRemoval();
      router.back();
    } catch {
      setSaveError("Failed to delete.");
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [allowRemoval, draft, noteId, router]);

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
        <Text className="text-sm text-muted-foreground">Loading…</Text>
      </View>
    );
  }

  if (loadFailed) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <Text className="text-sm text-muted-foreground">Failed to load data.</Text>
        <Pressable
          onPress={() => router.back()}
          className="min-h-[48px] justify-center rounded-full bg-primary px-4 py-2 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text className="text-sm font-medium text-primary-foreground">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const listFooter = (
    <View className="pb-3">
      {!isArchived && <Pressable
        onPress={handleAddItem}
        disabled={isBusy}
        className="min-h-[48px] flex-row items-center gap-2 rounded-full px-2 active:bg-muted"
        accessible
        accessibilityRole="button"
        accessibilityLabel="Add item"
        accessibilityState={{ disabled: isBusy }}
      >
        <Plus size={16} color={colors.mutedForeground} />
        <Text className="text-sm text-muted-foreground">Add item</Text>
      </Pressable>}

      {checkedItems.length > 0 ? (
        <View className="mt-2">
          <Pressable
            onPress={() => setCheckedExpanded((previous) => !previous)}
            className="min-h-[48px] flex-row items-center gap-2 rounded-full px-2 active:bg-muted"
            accessible
            accessibilityRole="button"
            accessibilityState={{ expanded: checkedExpanded }}
            accessibilityLabel={
              checkedItems.length === 1
                ? `${checkedItems.length} checked item`
                : `${checkedItems.length} checked items`
            }
          >
            {checkedExpanded ? (
              <ChevronDown size={18} color={colors.mutedForeground} />
            ) : (
              <ChevronRight size={18} color={colors.mutedForeground} />
            )}
            <Text className="text-sm text-muted-foreground">
              {checkedItems.length === 1
                ? `${checkedItems.length} checked item`
                : `${checkedItems.length} checked items`}
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
                    className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
                    accessibilityLabel={item.text || "List item"}
                  />
                  <Text className="flex-1 py-2 text-base text-muted-foreground line-through">
                    {item.text || "List item"}
                  </Text>
                  <Pressable
                    onPress={() => handleRemove(item.key)}
                    disabled={isBusy}
                    className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Delete item"
                    accessibilityState={{ disabled: isBusy }}
                  >
                    <X size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))
            : null}
        </View>
      ) : null}
      {items.length > 0 && <Text className="mt-2 px-2 text-label-medium text-muted-foreground">{`${checkedItems.length} of ${items.length} completed`}</Text>}
    </View>
  );

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-1 flex-col bg-background" style={pageMargins}>
          <View className="flex-row items-center justify-between pb-1 pt-2">
            <Pressable onPress={handleBack} disabled={isBusy} className="h-12 w-12 items-center justify-center rounded-full bg-secondary-container active:opacity-70 disabled:opacity-50"
              accessibilityRole="button" accessibilityLabel="Notes" accessibilityState={{ disabled: isBusy }}>
              <ArrowLeft size={20} color={colors.foreground} />
            </Pressable>
            <View className="min-w-0 flex-1 flex-row flex-wrap justify-end gap-1">
              <NoteActions isPinned={isPinned} isArchived={isArchived} canDelete={noteId !== null} disabled={isBusy}
                saving={isSaving} onSave={handleSave} onTogglePin={handleTogglePin} onDelete={handleDelete} onToggleArchive={handleToggleArchive} />
            </View>
          </View>

          {saveError && <Text accessibilityRole="alert" className="py-2 text-sm text-destructive">{saveError}</Text>}
          {draftError && <Pressable accessibilityRole="button" onPress={() => setDraftRetry(n => n + 1)} className="min-h-[48px] justify-center">
            <Text className="text-sm text-destructive">{draftError} Retry</Text>
          </Pressable>}
          {isArchived && <Text className="py-2 text-sm text-muted-foreground">Archived · read only</Text>}

          <DraggableFlatList
            className="w-full"
            data={activeItems}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            onDragBegin={handleDragBegin}
            onDragEnd={handleDragEnd}
            keyboardShouldPersistTaps="handled"
            renderScrollComponent={(props) => <KeyboardAwareScrollView {...props} ScrollViewComponent={KeyboardGestureScrollView} bottomOffset={80} />}
            showsVerticalScrollIndicator={false}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: isArchived ? insets.bottom + 16 : 16 }}
            ListHeaderComponent={<View>
              <TextInput
                value={title}
                editable={!isArchived && !isBusy}
                onChangeText={(value) => {
                  if (isArchived || operationRef.current !== "idle") return;
                  titleRef.current = value;
                  setTitle(value);
                }}
                accessibilityLabel="Title"
                placeholder="Title"
                placeholderTextColor={colors.mutedForeground}
                className="my-2 rounded-[24px] border border-border bg-surface px-4 py-3 text-2xl leading-8 font-semibold text-foreground"
                multiline
              />
              <NoteAttachments state={attachmentState} readOnly={isArchived} disabled={isBusy} />
              <View className="h-2" />
            </View>}
            ListFooterComponent={listFooter}
          />
          {!isArchived && <KeyboardStickyView className="w-full bg-background"
            style={{ paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 8 }}>
            <View className="flex-row items-center justify-between rounded-[30px] border border-border bg-surface p-1">
              <AttachmentToolbarButton disabled={isBusy} busy={attachmentState.busy}
                onSelect={kind => { void attachmentState.actionRef.current?.add(kind); }} />
              {keyboardVisible && <Pressable onPress={() => { toolbarFeedback(); Keyboard.dismiss(); }} disabled={isBusy}
                accessibilityRole="button" accessibilityLabel="Dismiss keyboard"
                className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container active:opacity-80 disabled:opacity-50">
                <FormattingIcon name="done" size={18} color={colors.onSecondaryContainer} />
              </Pressable>}
            </View>
          </KeyboardStickyView>}
        </View>
      </View>

      <ConfirmDialog
        visible={confirmState !== null}
        title={confirmState?.kind === "delete" ? "Delete note" : "Discard changes?"}
        message={confirmState?.kind === "delete" ? "Delete this note?" : "You have unsaved changes. Leave anyway?"}
        confirmLabel={
          confirmState?.kind === "delete" ? "Delete" : confirmState?.kind === "discard" ? "Discard changes" : "Confirm"
        }
        cancelLabel="Cancel"
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
