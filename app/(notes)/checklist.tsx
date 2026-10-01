import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { ArrowLeft, ChevronDown, ChevronRight, Pin, Plus, Trash2, X } from "../../src/components/AppIcons";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import {
  getNote,
  getChecklistItems,
  createChecklistNote,
  saveChecklistNote,
  deleteNote,
  type NewChecklistItem,
} from "../../src/lib/notes";
import { withTransaction } from "../../src/lib/db";
import { useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { CheckboxSquare } from "../../src/components/CheckboxSquare";
import {
  ChecklistItemRow,
  type ChecklistEntry,
} from "../../src/components/ChecklistItemRow";

type ConfirmState = { kind: "discard" } | { kind: "delete" } | null;

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
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  const loadTarget = useMemo<LoadTarget>(() => {
    if (id == null || id === "") return { kind: "new" };
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) return { kind: "invalid" };
    return { kind: "note", id: parsed };
  }, [id]);

  const [noteId, setNoteId] = useState<number | null>(() =>
    loadTarget.kind === "note" ? loadTarget.id : null
  );
  const [title, setTitle] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [items, setItems] = useState<ChecklistEntry[]>([]);
  const [checkedExpanded, setCheckedExpanded] = useState(false);
  const [loading, setLoading] = useState(() => loadTarget.kind === "note");
  const [asyncLoadFailed, setAsyncLoadFailed] = useState(false);
  const loadFailed = loadTarget.kind === "invalid" || asyncLoadFailed;
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // A ref closes the interval before React commits the disabled controls.
  const operationRef = useRef<"idle" | "dragging" | "saving">("idle");
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
    if (operationRef.current !== "idle") return;
    setItems((previous) => {
      const toggled = previous.map((item) =>
        item.key === key ? { ...item, checked: !item.checked } : item
      );
      // Keep the invariant that active items precede checked ones.
      return [...toggled.filter((item) => !item.checked), ...toggled.filter((item) => item.checked)];
    });
  }, []);

  const handleChangeText = useCallback((key: string, text: string) => {
    if (operationRef.current !== "idle") return;
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, text } : item))
    );
  }, []);

  const handleRemove = useCallback((key: string) => {
    if (operationRef.current !== "idle") return;
    void haptics.light();
    setItems((previous) => previous.filter((item) => item.key !== key));
  }, [haptics]);

  const handleAddItem = useCallback(() => {
    if (operationRef.current !== "idle") return;
    const key = `new-${keyCounterRef.current++}`;
    pendingFocusRef.current = key;
    void haptics.light();
    setItems((previous) => [
      ...previous.filter((item) => !item.checked),
      { key, text: "", checked: false },
      ...previous.filter((item) => item.checked),
    ]);
  }, [haptics]);

  const handleDragBegin = useCallback(() => {
    if (operationRef.current !== "idle") return;
    operationRef.current = "dragging";
    setIsDragging(true);
  }, []);

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
    if (snapshotRef.current === null) return false;
    return serialize(titleRef.current, pinnedRef.current, itemsRef.current) !== snapshotRef.current;
  }, []);

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

  const handleSave = useCallback(async () => {
    if (operationRef.current !== "idle" || loading || loadFailed) return;
    operationRef.current = "saving";
    setIsSaving(true);
    const savedItems = itemsRef.current;
    try {
      const payload: NewChecklistItem[] = savedItems.map(({ text, checked }) => ({ text, checked }));
      if (noteId) {
        await withTransaction((tx) =>
          saveChecklistNote(noteId, { title, is_pinned: isPinned }, payload, tx)
        );
      } else {
        const created = await createChecklistNote({ title, is_pinned: isPinned }, payload);
        setNoteId(created.id);
      }
      snapshotRef.current = serialize(title, isPinned, savedItems);
      allowRemoveRef.current = true;
      void haptics.success();
      toast.success(t("savedSuccess"));
      router.back();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      operationRef.current = "idle";
      setIsSaving(false);
    }
  }, [haptics, isPinned, loading, loadFailed, noteId, router, t, title]);

  const handleDelete = useCallback(() => {
    if (operationRef.current !== "idle") return;
    if (noteId) setConfirmState({ kind: "delete" });
  }, [noteId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!noteId) return;
    setConfirmState(null);
    try {
      await deleteNote(noteId);
      void haptics.light();
      allowRemoveRef.current = true;
      router.back();
    } catch {
      toast.error(t("deleteFailed"));
    }
  }, [haptics, noteId, router, t]);

  const handleTogglePin = useCallback(() => {
    if (operationRef.current !== "idle") return;
    void haptics.light();
    setIsPinned((previous) => !previous);
  }, [haptics]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ChecklistEntry>) => (
      <ScaleDecorator>
        <ChecklistItemRow
          item={item}
          disabled={isBusy}
          isActive={isActive}
          drag={drag}
          onToggle={handleToggle}
          onChangeText={handleChangeText}
          onRemove={handleRemove}
          registerInput={registerInput}
        />
      </ScaleDecorator>
    ),
    [handleChangeText, handleRemove, handleToggle, isBusy, registerInput]
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
      <Pressable
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
      </Pressable>

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
                <View key={item.key} className="flex-row items-center gap-1 px-3">
                  <Pressable
                    onPress={() => handleToggle(item.key)}
                    disabled={isBusy}
                    className="h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
                    accessible
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: true, disabled: isBusy }}
                    accessibilityLabel={item.text || t("notesItemPlaceholder")}
                  >
                    <CheckboxSquare checked />
                  </Pressable>
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
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        style={{ marginTop: keyboardVisible ? 1 : 0 }}
        behavior="padding"
        automaticOffset
      >
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
              <Pressable
                onPress={handleTogglePin}
                disabled={isBusy}
                className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={isPinned ? t("notesUnpin") : t("notesPin")}
                accessibilityState={{ disabled: isBusy }}
              >
                <Pin size={20} color={isPinned ? colors.primary : colors.mutedForeground} />
              </Pressable>
              {noteId ? (
                <Pressable
                  onPress={handleDelete}
                  disabled={isBusy}
                  className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted"
                  accessibilityRole="button"
                  accessibilityLabel={t("notesDelete")}
                  accessibilityState={{ disabled: isBusy }}
                >
                  <Trash2 size={20} color={colors.destructive} />
                </Pressable>
              ) : null}
              <Pressable
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
              </Pressable>
            </View>
          </View>

          <DraggableFlatList
            className="w-full max-w-md self-center"
            data={activeItems}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            onDragBegin={handleDragBegin}
            onDragEnd={handleDragEnd}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(24, insets.bottom + 16) }}
            ListHeaderComponent={
              <TextInput
                value={title}
                editable={!isSaving}
                onChangeText={setTitle}
                placeholder={t("notesUntitled")}
                placeholderTextColor={colors.mutedForeground}
                className="w-full px-4 pt-2 pb-1 text-2xl font-bold text-foreground"
                multiline
              />
            }
            ListFooterComponent={listFooter}
          />
        </View>
      </KeyboardAvoidingView>

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
