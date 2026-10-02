import { Fragment, useEffect, useMemo, useRef, useState, useCallback, type ComponentRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState, type KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Trash2,
  ArrowLeft,
  Pin,
  Check,
  MoreHorizontal,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Plus,
} from "../../src/components/AppIcons";
import { Checkbox } from "../../src/components/ui/Checkbox";
import { EnrichedTextInput } from "react-native-enriched-html";
import type {
  EnrichedTextInputInstance,
  HtmlStyle,
  OnChangeHtmlEvent,
  OnChangeSelectionEvent,
  OnChangeStateEvent,
  OnChangeTextEvent,
  TextShortcut,
} from "react-native-enriched-html";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import {
  getNote,
  createNote,
  updateNote,
  deleteNote,
} from "../../src/lib/notes";
import { useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import {
  contentToEditorHtml,
  appendCheckboxItem,
  insertCheckboxItemAtLine,
  applyCheckedStrikethrough,
  parseCheckedStates,
  hasCheckboxMarkup,
} from "../../src/lib/noteContent";
import { withAlpha } from "../../src/lib/utils";

type ConfirmState =
  | { kind: "discard"; action: "back" | "pending" }
  | { kind: "delete" }
  | null;

type MenuAnchor = { x: number; y: number; width: number; height: number };

const ACTION_MENU_WIDTH = 208;
const ACTION_MENU_EDGE = 8;

type LoadTarget =
  | { kind: "new" }
  | { kind: "invalid" }
  | { kind: "note"; id: number };

type StyleStateKey = Exclude<keyof OnChangeStateEvent, "alignment">;

type FormatButton = {
  type: "bold" | "italic" | "strikethrough" | "bullet" | "numbered" | "checklist";
  labelKey: "notesBold" | "notesItalic" | "notesStrikethrough" | "notesBulletList" | "notesNumberedList" | "notesChecklist";
  icon: typeof Bold;
  stateKey: StyleStateKey;
  toggle: (editor: EnrichedTextInputInstance) => void;
};

const TEXT_SHORTCUTS: TextShortcut[] = [
  { trigger: "- ", style: "unordered_list" },
  { trigger: "1. ", style: "ordered_list" },
  { trigger: "[] ", style: "checkbox_list" },
];

function ChecklistIcon() {
  return <Checkbox displayOnly checked />;
}

const FORMAT_BUTTONS: FormatButton[] = [
  {
    type: "bold",
    labelKey: "notesBold",
    icon: Bold,
    stateKey: "bold",
    toggle: (editor) => editor.toggleBold(),
  },
  {
    type: "italic",
    labelKey: "notesItalic",
    icon: Italic,
    stateKey: "italic",
    toggle: (editor) => editor.toggleItalic(),
  },
  {
    type: "strikethrough",
    labelKey: "notesStrikethrough",
    icon: Strikethrough,
    stateKey: "strikeThrough",
    toggle: (editor) => editor.toggleStrikeThrough(),
  },
  {
    type: "bullet",
    labelKey: "notesBulletList",
    icon: List,
    stateKey: "unorderedList",
    toggle: (editor) => editor.toggleUnorderedList(),
  },
  {
    type: "numbered",
    labelKey: "notesNumberedList",
    icon: ListOrdered,
    stateKey: "orderedList",
    toggle: (editor) => editor.toggleOrderedList(),
  },
  {
    type: "checklist",
    labelKey: "notesChecklist",
    icon: ChecklistIcon,
    stateKey: "checkboxList",
    toggle: (editor) => editor.toggleCheckboxList(false),
  },
];

// The native editor emits onChangeState on every caret move and keystroke, and
// the event object is always new. Keep the previous object when none of the
// flags the toolbar actually renders have changed, so the screen does not
// re-render for a no-op state event.
function isSameFormatState(a: OnChangeStateEvent, b: OnChangeStateEvent): boolean {
  for (const button of FORMAT_BUTTONS) {
    const prev = a[button.stateKey];
    const next = b[button.stateKey];
    if (
      prev.isActive !== next.isActive ||
      prev.isBlocking !== next.isBlocking ||
      prev.isConflicting !== next.isConflicting
    ) {
      return false;
    }
  }
  return true;
}

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const moreButtonRef = useRef<ComponentRef<typeof View>>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [styleState, setStyleState] = useState<OnChangeStateEvent | null>(null);

  const [noteId, setNoteId] = useState<number | null>(() => {
    const parsed = id ? Number(id) : null;
    return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [title, setTitle] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const loadTarget = useMemo<LoadTarget>(() => {
    if (id == null || id === "") return { kind: "new" };
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) return { kind: "invalid" };
    return { kind: "note", id: parsed };
  }, [id]);
  const [loading, setLoading] = useState(() => loadTarget.kind === "note");
  const [asyncLoadFailed, setAsyncLoadFailed] = useState(false);
  const loadFailed = loadTarget.kind === "invalid" || asyncLoadFailed;
  const [initialHtml, setInitialHtml] = useState("<p></p>");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [toolbarHeight, setToolbarHeight] = useState(57);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const plainTextRef = useRef("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  // Snapshot of the last persisted/loaded state, used to decide whether there
  // are actually unsaved changes instead of a fragile dirty flag.
  const savedSnapshotRef = useRef<{ title: string; html: string; pinned: boolean } | null>(null);
  const checkedStatesRef = useRef<boolean[] | null>(null);
  const titleRef = useRef(title);
  const pinnedRef = useRef(isPinned);

  useEffect(() => {
    titleRef.current = title;
    pinnedRef.current = isPinned;
  }, [title, isPinned]);

  const htmlStyle = useMemo<HtmlStyle>(
    () => ({
      h1: { fontSize: 28, bold: true },
      h2: { fontSize: 22, bold: true },
      h3: { fontSize: 18, bold: true },
      blockquote: { borderColor: colors.border, color: colors.mutedForeground },
      codeblock: { backgroundColor: colors.muted, color: colors.foreground },
      code: { backgroundColor: colors.muted, color: colors.foreground },
      a: { color: colors.primary },
      ul: { bulletColor: colors.mutedForeground, bulletSize: 6, gapWidth: 12, marginLeft: 4 },
      ol: { gapWidth: 12, marginLeft: 4, markerFontWeight: "500", markerColor: colors.mutedForeground },
      ulCheckbox: {
        boxColor: colors.primary,
        boxSize: 20,
        gapWidth: 8,
        marginLeft: 2,
      },
    }),
    [colors.border, colors.mutedForeground, colors.muted, colors.foreground, colors.primary]
  );

  // Stable style objects: the inline literals were recreated on every render
  // of this screen (which fires on each editor state event).
  const editorStyle = useMemo(
    () => ({
      minHeight: 240,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 24,
      backgroundColor: "transparent",
      color: colors.foreground,
      fontSize: 16,
      fontFamily: "Urbanist-Regular",
    }),
    [colors.foreground]
  );

  const toolbarStyle = useMemo(
    () => ({ paddingBottom: keyboardVisible ? 0 : insets.bottom }),
    [keyboardVisible, insets.bottom]
  );

  useEffect(() => {
    if (loadTarget.kind !== "note") return;

    let cancelled = false;
    savedSnapshotRef.current = null;
    checkedStatesRef.current = null;
    getNote(loadTarget.id)
      .then((note) => {
        if (cancelled) return;
        if (note) {
          setNoteId(note.id);
          setTitle(note.title);
          setIsPinned(note.is_pinned);
          setInitialHtml(applyCheckedStrikethrough(contentToEditorHtml(note.content)));
        } else {
          setNoteId(null);
          setTitle("");
          setIsPinned(false);
          setInitialHtml("<p></p>");
          setAsyncLoadFailed(true);
        }
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
  }, [loadTarget, t]);

  // Capture the editor's normalized HTML once it is ready so change checks
  // compare against the real serialized form, not the pre-parse default.
  useEffect(() => {
    if (loading || loadFailed) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor || savedSnapshotRef.current) return;
      void editor
        .getHTML()
        .then((html) => {
          if (cancelled || savedSnapshotRef.current) return;
          savedSnapshotRef.current = {
            title: titleRef.current,
            html,
            pinned: pinnedRef.current,
          };
          checkedStatesRef.current = hasCheckboxMarkup(html) ? parseCheckedStates(html) : [];
        })
        .catch(() => {
          // Non-critical: the snapshot is captured on the first change instead.
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [loading, loadFailed, noteId, initialHtml]);

  const handleChangeHtml = useCallback((event: { nativeEvent: OnChangeHtmlEvent }) => {
    const value = event.nativeEvent.value;

    if (!savedSnapshotRef.current) {
      savedSnapshotRef.current = {
        title: titleRef.current,
        html: value,
        pinned: pinnedRef.current,
      };
      checkedStatesRef.current = hasCheckboxMarkup(value) ? parseCheckedStates(value) : [];
      return;
    }

    // The native checkbox span has no checked-text style, so mirror the checked
    // state with `<s>`. Only act on a real toggle or on an item being added or
    // removed, so typing never triggers a setValue (and the resulting echo is a
    // no-op). Adding an item matters because the new line inherits the text
    // span of the previous one, so an item created after a checked one is born
    // struck-through and would keep that until a toggle reset it.
    const previous = checkedStatesRef.current;
    // Fast path: skip the full-document parse when there is no checklist to
    // track. onChangeHtml fires on every keystroke, so this matters for plain
    // notes (typing lag on large documents).
    if (!hasCheckboxMarkup(value) && (previous === null || previous.length === 0)) {
      if (previous !== null) checkedStatesRef.current = [];
      return;
    }

    const states = hasCheckboxMarkup(value) ? parseCheckedStates(value) : [];
    checkedStatesRef.current = states;

    const toggled =
      previous !== null &&
      states.length === previous.length &&
      states.some((checked, index) => checked !== previous[index]);
    const listResized = previous !== null && states.length !== previous.length;
    if (!toggled && !listResized) return;

    const normalized = applyCheckedStrikethrough(value);
    const editor = editorRef.current;
    if (editor && normalized !== value) {
      const selection = selectionRef.current;
      editor.setValue(normalized);
      if (selection) editor.setSelection(selection.start, selection.end);
    }
  }, []);

  const handleChangeState = useCallback((event: { nativeEvent: OnChangeStateEvent }) => {
    const next = event.nativeEvent;
    setStyleState((prev) => (prev !== null && isSameFormatState(prev, next) ? prev : next));
  }, []);

  const handleChangeSelection = useCallback(
    (event: { nativeEvent: OnChangeSelectionEvent }) => {
      selectionRef.current = {
        start: event.nativeEvent.start,
        end: event.nativeEvent.end,
      };
    },
    []
  );

  const handleChangeText = useCallback((event: { nativeEvent: OnChangeTextEvent }) => {
    plainTextRef.current = event.nativeEvent.value;
  }, []);

  const handleAddListItem = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || isAddingItem || isSaving) return;
    setIsAddingItem(true);
    try {
      const currentHtml = await editor.getHTML();
      const text = plainTextRef.current;
      const rawCaret = selectionRef.current?.start ?? text.length;
      // A checkbox list implies content, so an empty plain-text buffer means the
      // onChangeText ref has not been populated yet and line mapping is unsafe.
      const stale = text.length === 0 || rawCaret > text.length;
      const caret = Math.min(rawCaret, text.length);
      const lineBreak = text.indexOf("\n", caret);
      const lineEnd = lineBreak === -1 ? text.length : lineBreak;
      const lineIndex = (text.slice(0, caret).match(/\n/g) ?? []).length;

      const inserted = stale ? null : insertCheckboxItemAtLine(currentHtml, lineIndex);
      const nextHtml = inserted ?? appendCheckboxItem(currentHtml);
      if (!nextHtml) return;

      editor.setValue(nextHtml);
      if (inserted) {
        // Place the caret inside the newly inserted line. Fallback appends at
        // the end of the document and relies on setValue focusing the end.
        const nextCaret = lineEnd + 1;
        editor.setSelection(nextCaret, nextCaret);
      }
      editor.focus();
      void haptics.light();
      // Keep the newly inserted line (and the Add item row) visible.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      toast.error(t("notesAddItemFailed"));
    } finally {
      setIsAddingItem(false);
    }
  }, [haptics, isAddingItem, isSaving, t]);

  const showAddItem = styleState?.checkboxList.isActive === true && !isSaving;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const isDirtyNow = useCallback(async (): Promise<boolean> => {
    const snapshot = savedSnapshotRef.current;
    const editor = editorRef.current;
    if (!snapshot || !editor) return false;
    try {
      const html = await editor.getHTML();
      return (
        titleRef.current !== snapshot.title ||
        pinnedRef.current !== snapshot.pinned ||
        html !== snapshot.html
      );
    } catch {
      return false;
    }
  }, []);

  const navigation = useNavigation();
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
        if (checkingRemoveRef.current) return;
        const action = event.data.action;
        checkingRemoveRef.current = true;
        void isDirtyNow().then((dirty) => {
          checkingRemoveRef.current = false;
          if (!dirty) {
            allowRemoveRef.current = true;
            navigation.dispatch(action as never);
            return;
          }
          pendingRemoveActionRef.current = () => {
            allowRemoveRef.current = true;
            navigation.dispatch(action as never);
          };
          setConfirmState({ kind: "discard", action: "pending" });
        });
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
    if (isSaving || loadFailed) return;
    const editor = editorRef.current;
    if (!editor) return;
    setIsSaving(true);
    try {
      // Normalize before persisting so the stored HTML, the search index and
      // the list preview can never show a struck-through unchecked item.
      const content = applyCheckedStrikethrough(await editor.getHTML());
      if (noteId) {
        await updateNote(noteId, { title, content, is_pinned: isPinned });
      } else {
        const created = await createNote({ title, content, is_pinned: isPinned });
        setNoteId(created.id);
      }
      savedSnapshotRef.current = { title, html: content, pinned: isPinned };
      checkedStatesRef.current = parseCheckedStates(content);
      allowRemoveRef.current = true;
      void haptics.success();
      toast.success(t("savedSuccess"));
      router.back();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [haptics, isPinned, isSaving, loadFailed, noteId, router, t, title]);

  const handleDelete = useCallback(() => {
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
    void haptics.light();
    setIsPinned((previous) => !previous);
  }, [haptics]);

  const openActions = useCallback(() => {
    const button = moreButtonRef.current;
    if (!button) return;
    void haptics.light();
    button.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  }, [haptics]);

  const menuLeft = menuAnchor
    ? Math.min(
        Math.max(menuAnchor.x + menuAnchor.width - ACTION_MENU_WIDTH, ACTION_MENU_EDGE),
        Math.max(ACTION_MENU_EDGE, windowWidth - ACTION_MENU_WIDTH - ACTION_MENU_EDGE)
      )
    : ACTION_MENU_EDGE;

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
          className="rounded-lg bg-primary px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel={t("cancel")}
        >
          <Text className="text-sm font-medium text-primary-foreground">{t("cancel")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-1 flex-col bg-background">
          {/* Fixed header */}
          <View className="w-full max-w-md flex-row items-center justify-between self-center px-4 pt-3 pb-1">
            <Pressable
              onPress={handleBack}
              className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t("cancel")}
            >
              <ArrowLeft size={24} color={colors.foreground} />
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable
                ref={moreButtonRef}
                onPress={openActions}
                className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 active:bg-muted"
                accessible
                accessibilityRole="button"
                accessibilityLabel={t("notesMoreActions")}
                accessibilityState={{ expanded: menuAnchor !== null }}
              >
                <MoreHorizontal size={22} color={isPinned ? colors.primary : colors.mutedForeground} />
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                className={`min-h-[44px] items-center justify-center rounded-lg px-4 py-2 active:opacity-70 ${!isSaving ? "bg-primary" : "bg-primary/50"}`}
                accessibilityRole="button"
                accessibilityLabel={t("save")}
                accessibilityState={{ disabled: isSaving, busy: isSaving }}
              >
                <Text accessibilityLiveRegion="polite" className="text-sm font-medium text-primary-foreground">
                  {t(isSaving ? "saving" : "save")}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Fill the available writing area and keep growing for longer notes. */}
          <KeyboardAwareScrollView
            ref={scrollRef}
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            bottomOffset={toolbarHeight + 12}
            extraKeyboardSpace={toolbarHeight}
            contentContainerStyle={{ flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-md flex-grow self-center">
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t("notesTitlePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                className="w-full px-4 pt-2 pb-1 text-2xl font-bold text-foreground"
                multiline
              />

              <View className="mt-3 min-h-[240px]">
                <EnrichedTextInput
                  ref={editorRef}
                  defaultValue={initialHtml}
                  placeholder={t("notesContentPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  selectionColor={colors.primary}
                  cursorColor={colors.primary}
                  htmlStyle={htmlStyle}
                  style={editorStyle}
                  scrollEnabled={false}
                  textShortcuts={TEXT_SHORTCUTS}
                  onChangeHtml={handleChangeHtml}
                  onChangeState={handleChangeState}
                  onChangeSelection={handleChangeSelection}
                  onChangeText={handleChangeText}
                />
              </View>

              {showAddItem ? (
                <Pressable
                  onPress={() => {
                    void handleAddListItem();
                  }}
                  disabled={isAddingItem}
                  className="min-h-[44px] flex-row items-center gap-2 px-4"
                  android_ripple={{ color: withAlpha(colors.foreground, 0.1) }}
                  accessibilityRole="button"
                  accessibilityLabel={t("notesAddItem")}
                  accessibilityState={{ disabled: isAddingItem }}
                >
                  <Plus size={16} color={colors.mutedForeground} />
                  <Text className="text-sm text-muted-foreground">
                    {t("notesAddItem")}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => editorRef.current?.focus()}
                className="flex-grow"
                accessible
                accessibilityRole="button"
                accessibilityLabel={t("notesContinueWriting")}
              />
            </View>
          </KeyboardAwareScrollView>

          {/* Pinned toolbar — rides above the software keyboard. */}
          <KeyboardStickyView
            className="w-full border-t border-border bg-background"
            style={toolbarStyle}
            onLayout={({ nativeEvent }) => setToolbarHeight(nativeEvent.layout.height)}
          >
            <View className="w-full max-w-md flex-row items-center justify-center self-center px-2 py-1.5">
              <View className="flex-row items-center rounded-xl bg-muted/50 px-1">
                {FORMAT_BUTTONS.map((button) => {
                  const state = styleState?.[button.stateKey];
                  const active = state?.isActive ?? false;
                  const blocked = state?.isBlocking ?? false;
                  return (
                    <Fragment key={button.type}>
                      {button.type === "bullet" ? <View className="mx-1 h-6 w-px bg-border" /> : null}
                      <Pressable
                        onPress={() => {
                          const editor = editorRef.current;
                          if (!editor || blocked) return;
                          button.toggle(editor);
                          void haptics.light();
                        }}
                        disabled={blocked}
                        className={`h-11 w-11 items-center justify-center rounded-lg active:bg-primary/10 ${
                          active ? "bg-primary/15" : blocked ? "opacity-40" : ""
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel={t(button.labelKey)}
                        accessibilityState={{ selected: active, disabled: blocked }}
                      >
                        <button.icon
                          size={18}
                          color={active ? colors.primary : colors.foreground}
                        />
                      </Pressable>
                    </Fragment>
                  );
                })}
              </View>
            </View>
          </KeyboardStickyView>
        </View>
      </View>

      <Modal
        visible={menuAnchor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuAnchor(null)}
      >
        <Pressable
          className="flex-1 bg-black/20"
          onPress={() => setMenuAnchor(null)}
          accessibilityRole="button"
          accessibilityLabel={t("cancel")}
        >
          {menuAnchor ? (
            <View
              className="absolute rounded-2xl border border-border/60 bg-card p-2 shadow-md"
              style={{ top: menuAnchor.y + menuAnchor.height + 4, left: menuLeft, width: ACTION_MENU_WIDTH }}
            >
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  setMenuAnchor(null);
                  handleTogglePin();
                }}
                className="min-h-[44px] flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-muted"
                accessible
                accessibilityRole="menuitem"
                accessibilityLabel={isPinned ? t("notesUnpin") : t("notesPin")}
              >
                <Pin size={20} color={isPinned ? colors.primary : colors.mutedForeground} />
                <Text className="flex-1 text-base text-foreground">{t(isPinned ? "notesUnpin" : "notesPin")}</Text>
                {isPinned ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
              {noteId ? (
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    setMenuAnchor(null);
                    handleDelete();
                  }}
                  className="min-h-[44px] flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-muted"
                  accessible
                  accessibilityRole="menuitem"
                  accessibilityLabel={t("notesDelete")}
                >
                  <Trash2 size={20} color={colors.destructive} />
                  <Text className="text-base text-destructive">{t("notesDelete")}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={confirmState !== null}
        title={
          confirmState?.kind === "delete"
            ? t("notesDelete")
            : confirmState?.kind === "discard"
              ? t("discardChangesTitle")
              : ""
        }
        message={
          confirmState?.kind === "delete"
            ? t("notesDeleteConfirm")
            : confirmState?.kind === "discard"
              ? t("notesUnsavedChanges")
              : ""
        }
        confirmLabel={
          confirmState?.kind === "delete"
            ? t("delete")
            : confirmState?.kind === "discard"
              ? t("discard")
              : t("confirm")
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
