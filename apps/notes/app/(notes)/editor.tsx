import { Text, TextInput } from "../../src/components/ui/Typography";
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Pressable, ScrollView, Keyboard } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView, useKeyboardState, type KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Plus,
} from "../../src/components/AppIcons";
import { FormattingIcon } from "../../src/components/FormattingIcon";
import { toolbarFeedback } from "../../src/lib/toolbarFeedback";
import { EnrichedText, EnrichedTextInput } from "react-native-enriched-html";
import type {
  EnrichedTextInputInstance,
  HtmlStyle,
  OnChangeHtmlEvent,
  OnChangeSelectionEvent,
  OnChangeStateEvent,
  OnChangeTextEvent,
  TextShortcut,
} from "react-native-enriched-html";
import { useRouter, useLocalSearchParams, usePreventRemove } from "expo-router";
import { toast } from "sonner-native";
import {
  getNote,
  createNote,
  updateNote,
  deleteNote,
  restoreNote,
} from "../../src/lib/notes";
import { useThemeColors } from "../../src/lib/theme";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { NoteActions } from "../../src/components/NoteActions";
import { NoteAttachments } from "../../src/components/NoteAttachments";
import { AttachmentToolbarButton } from "../../src/components/AttachmentToolbarButton";
import { useNoteAttachments } from "../../src/lib/useNoteAttachments";
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

type LoadTarget =
  | { kind: "new" }
  | { kind: "invalid" }
  | { kind: "note"; id: number };

type StyleStateKey = "bold" | "italic" | "strikeThrough" | "unorderedList" | "orderedList" | "checkboxList";

type FormatButton = {
  type: "bold" | "italic" | "strikethrough" | "bullet" | "numbered" | "checklist";
  label: string;
  stateKey: StyleStateKey;
  toggle: (editor: EnrichedTextInputInstance) => void;
};

const TEXT_SHORTCUTS: TextShortcut[] = [
  { trigger: "- ", style: "unordered_list" },
  { trigger: "1. ", style: "ordered_list" },
  { trigger: "[] ", style: "checkbox_list" },
];

const FORMAT_BUTTONS: FormatButton[] = [
  {
    type: "bold",
    label: "Bold",
    stateKey: "bold",
    toggle: (editor) => editor.toggleBold(),
  },
  {
    type: "italic",
    label: "Italic",
    stateKey: "italic",
    toggle: (editor) => editor.toggleItalic(),
  },
  {
    type: "strikethrough",
    label: "Strikethrough",
    stateKey: "strikeThrough",
    toggle: (editor) => editor.toggleStrikeThrough(),
  },
  {
    type: "bullet",
    label: "Bullet list",
    stateKey: "unorderedList",
    toggle: (editor) => editor.toggleUnorderedList(),
  },
  {
    type: "numbered",
    label: "Numbered list",
    stateKey: "orderedList",
    toggle: (editor) => editor.toggleOrderedList(),
  },
  {
    type: "checklist",
    label: "Checklist",
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
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const attachmentState = useNoteAttachments();
  const { initialize: initializeAttachments, hasChanges: attachmentsChanged, valueRef: attachmentsRef, busyRef: attachmentsBusyRef } = attachmentState;
  const [styleState, setStyleState] = useState<OnChangeStateEvent | null>(null);

  const [noteId, setNoteId] = useState<number | null>(() => {
    const parsed = id ? Number(id) : null;
    return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [title, setTitle] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const loadTarget = useMemo<LoadTarget>(() => {
    if (id == null || id === "") return { kind: "new" };
    const parsed = Number(id);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return { kind: "invalid" };
    return { kind: "note", id: parsed };
  }, [id]);
  const [loading, setLoading] = useState(() => loadTarget.kind === "note");
  const [asyncLoadFailed, setAsyncLoadFailed] = useState(false);
  const loadFailed = loadTarget.kind === "invalid" || asyncLoadFailed;
  const [initialHtml, setInitialHtml] = useState("<p></p>");
  const [isSaving, setIsSaving] = useState(false);
  const mutationInFlightRef = useRef(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [removalAllowed, setRemovalAllowed] = useState(false);
  const removalAllowedRef = useRef(false);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [toolbarHeight, setToolbarHeight] = useState(57);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const plainTextRef = useRef("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  // Snapshot of the last persisted/loaded state, used to decide whether there
  // are actually unsaved changes instead of a fragile dirty flag.
  const savedSnapshotRef = useRef<string | null>(null);
  const contentChangedBeforeSnapshotRef = useRef(false);
  const initialFieldsRef = useRef({ title: "", pinned: false });
  const checkedStatesRef = useRef<boolean[] | null>(null);
  const titleRef = useRef(title);
  const pinnedRef = useRef(isPinned);

  useEffect(() => {
    titleRef.current = title;
    pinnedRef.current = isPinned;
  }, [title, isPinned]);

  const htmlStyle = useMemo<HtmlStyle>(
    () => ({
      h1: { fontSize: 26, bold: true },
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
      minHeight: 160,
      paddingHorizontal: 0,
      paddingTop: 10,
      paddingBottom: 12,
      backgroundColor: "transparent",
      color: colors.foreground,
      fontSize: 16,
      fontFamily: "Urbanist",
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
    contentChangedBeforeSnapshotRef.current = false;
    checkedStatesRef.current = null;
    getNote(loadTarget.id)
      .then((note) => {
        if (cancelled) return;
        if (note) {
          if (note.kind === "checklist") {
            router.replace({ pathname: "/(notes)/checklist", params: { id: String(note.id) } });
            return;
          }
          initialFieldsRef.current = { title: note.title, pinned: note.is_pinned };
          setNoteId(note.id);
          setTitle(note.title);
          setIsPinned(note.is_pinned);
          setIsArchived(note.is_archived);
          initializeAttachments(note.attachments ?? []);
          setInitialHtml(applyCheckedStrikethrough(contentToEditorHtml(note.content)));
        } else {
          setNoteId(null);
          setTitle("");
          setIsPinned(false);
          setInitialHtml("<p></p>");
          initialFieldsRef.current = { title: "", pinned: false };
          setAsyncLoadFailed(true);
        }
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
  }, [loadTarget, router, initializeAttachments]);

  // Capture the editor's normalized HTML once it is ready so change checks
  // compare against the real serialized form, not the pre-parse default.
  useEffect(() => {
    if (loading || loadFailed) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor || savedSnapshotRef.current !== null) return;
      void editor
        .getHTML()
        .then((html) => {
          if (cancelled || savedSnapshotRef.current !== null) return;
          savedSnapshotRef.current = html;
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

    if (savedSnapshotRef.current === null) {
      savedSnapshotRef.current = value;
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
    if (!editor || isArchived || isAddingItem || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
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

      // Keep the newly inserted line (and the Add item row) visible.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      toast.error("Could not add item");
    } finally {
      mutationInFlightRef.current = false;
      setIsAddingItem(false);
    }
  }, [isArchived, isAddingItem]);

  const showAddItem = !isArchived && styleState?.checkboxList.isActive === true && !isSaving;

  const handleBack = useCallback(() => {
    if (mutationInFlightRef.current || isAddingItem) return;
    router.back();
  }, [isAddingItem, router]);

  const isDirtyNow = useCallback(async (): Promise<boolean> => {
    if (isArchived) return false;
    if (attachmentsChanged()) return true;
    const snapshot = savedSnapshotRef.current;
    const editor = editorRef.current;
    const fieldsChanged =
      titleRef.current !== initialFieldsRef.current.title ||
      pinnedRef.current !== initialFieldsRef.current.pinned;
    if (contentChangedBeforeSnapshotRef.current) return true;
    if (snapshot === null || !editor) return fieldsChanged;
    try {
      const html = await editor.getHTML();
      return (
        fieldsChanged ||
        html !== snapshot
      );
    } catch {
      // An unreadable editor may contain unsaved text; ask before leaving.
      return true;
    }
  }, [isArchived, attachmentsChanged]);

  const pendingRemoveActionRef = useRef<(() => void) | null>(null);
  const checkingRemoveRef = useRef(false);
  const disableRemovalPrevention = usePreventRemove(!removalAllowed, ({ repeat }) => {
    if (mutationInFlightRef.current || isAddingItem || attachmentsBusyRef.current) return;
    if (checkingRemoveRef.current) return;
    checkingRemoveRef.current = true;
    void isDirtyNow().then((dirty) => {
      checkingRemoveRef.current = false;
      // A save can start while the native HTML read above is pending.
      if (removalAllowedRef.current || mutationInFlightRef.current || attachmentsBusyRef.current) return;
      if (!dirty) {
        removalAllowedRef.current = true;
        setRemovalAllowed(true);
        repeat();
        return;
      }
      pendingRemoveActionRef.current = () => {
        removalAllowedRef.current = true;
        setRemovalAllowed(true);
        repeat();
      };
      setConfirmState({ kind: "discard", action: "pending" });
    });
  });
  const allowRemoval = useCallback(() => {
    removalAllowedRef.current = true;
    setRemovalAllowed(true);
    disableRemovalPrevention();
  }, [disableRemovalPrevention]);

  const handleConfirmDiscard = useCallback(() => {
    if (mutationInFlightRef.current) return;
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
    if (isArchived || mutationInFlightRef.current || isAddingItem || loading || loadFailed || attachmentsBusyRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;
    mutationInFlightRef.current = true;
    setIsSaving(true);
    const savedTitle = titleRef.current;
    const savedPinned = pinnedRef.current;
    try {
      // Normalize before persisting so the stored HTML, the search index and
      // the list preview can never show a struck-through unchecked item.
      const content = applyCheckedStrikethrough(await editor.getHTML());
      if (noteId) {
        await updateNote(noteId, { title: savedTitle, content, is_pinned: savedPinned, is_archived: archived,
          attachments: attachmentsChanged() ? attachmentsRef.current : undefined });
      } else {
        const created = await createNote({ title: savedTitle, content, is_pinned: savedPinned, attachments: attachmentsRef.current });
        setNoteId(created.id);
      }
      savedSnapshotRef.current = content;
      contentChangedBeforeSnapshotRef.current = false;
      checkedStatesRef.current = parseCheckedStates(content);
      allowRemoval();

      toast.success(archived === undefined ? "Saved successfully" : archived ? "Note archived" : "Note restored to Notes");
      router.back();
    } catch {
      toast.error(archived === undefined ? "Failed to save." : "Could not save and move the note. Please try again.");
    } finally {
      mutationInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [allowRemoval, isArchived, isAddingItem, loading, loadFailed, noteId, router, attachmentsRef, attachmentsBusyRef, attachmentsChanged]);

  const handleSave = useCallback(() => persistNote(), [persistNote]);
  const handleToggleArchive = useCallback(async () => {
    if (!isArchived) return persistNote(true);
    if (!noteId || mutationInFlightRef.current || loading || loadFailed) return;
    mutationInFlightRef.current = true;
    setIsSaving(true);
    try {
      await restoreNote(noteId);
      allowRemoval();

      toast.success("Note restored to Notes");
      router.back();
    } catch {
      toast.error("Could not restore the note. Please try again.");
    } finally {
      mutationInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [allowRemoval, isArchived, loading, loadFailed, noteId, persistNote, router]);

  const handleDelete = useCallback(() => {
    if (mutationInFlightRef.current || isAddingItem) return;
    if (noteId) setConfirmState({ kind: "delete" });
  }, [isAddingItem, noteId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!noteId || mutationInFlightRef.current || isAddingItem) return;
    mutationInFlightRef.current = true;
    setIsSaving(true);
    setConfirmState(null);
    try {
      await deleteNote(noteId);

      allowRemoval();
      router.back();
    } catch {
      toast.error("Failed to delete.");
    } finally {
      mutationInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [allowRemoval, isAddingItem, noteId, router]);

  const handleTogglePin = useCallback(() => {
    if (isArchived || mutationInFlightRef.current || isAddingItem) return;

    pinnedRef.current = !pinnedRef.current;
    setIsPinned(pinnedRef.current);
  }, [isArchived, isAddingItem]);

  const formatToolbar = (
    <View className="w-full max-w-md flex-row items-center gap-0.5 self-center px-2 py-1">
      <AttachmentToolbarButton disabled={isSaving || isAddingItem} busy={attachmentState.busy}
        onSelect={kind => { void attachmentState.actionRef.current?.add(kind); }} />
      <ScrollView horizontal className="min-w-0 flex-1 overflow-hidden" showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always" contentContainerStyle={{ alignItems: "center" }}>
      <View className="flex-row items-center">
        {FORMAT_BUTTONS.map((button) => {
          const state = styleState?.[button.stateKey];
          const active = state?.isActive ?? false;
          const blocked = state?.isBlocking ?? false;
          return (
            <Fragment key={button.type}>
              {button.type === "bullet" ? <View className="h-5 w-px bg-border" accessible={false} /> : null}
              <Pressable
                onPress={() => {
                  const editor = editorRef.current;
                  if (!editor || blocked || mutationInFlightRef.current) return;
                  button.toggle(editor);
                  toolbarFeedback();
                }}
                disabled={blocked || isSaving || isAddingItem}
                className={`h-12 w-12 items-center justify-center rounded-full active:bg-secondary ${
                  active ? "bg-secondary-container" : blocked ? "opacity-40" : ""
                }`}
                accessibilityRole="button"
                accessibilityLabel={button.label}
                accessibilityState={{ selected: active, disabled: blocked || isSaving || isAddingItem }}
              >
                <FormattingIcon name={button.type}
                  size={19}
                  color={active ? colors.onSecondaryContainer : colors.foreground}
                />
              </Pressable>
            </Fragment>
          );
        })}
      </View>
      </ScrollView>
      {keyboardVisible && <View className="shrink-0 border-l border-border/60 pl-1">
      <Pressable onPress={() => {
        toolbarFeedback();
        editorRef.current?.blur();
        Keyboard.dismiss();
      }} disabled={isSaving || isAddingItem}
        accessibilityRole="button" accessibilityLabel="Dismiss keyboard"
        className="h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container active:opacity-80 disabled:opacity-50">
        <FormattingIcon name="done" size={18} color={colors.onSecondaryContainer} />
      </Pressable>
      </View>}
    </View>
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
          className="rounded-lg bg-primary px-4 max-[360px]:px-3 py-2"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text className="text-sm font-medium text-primary-foreground">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="flex-1 flex-col bg-background">
          {/* Fixed header */}
          <View className="w-full max-w-md flex-row items-center justify-between self-center px-4 pb-1 pt-1">
            <Pressable onPress={handleBack} disabled={isSaving || isAddingItem} className="h-12 w-12 items-center justify-center rounded-full active:bg-surface-container-high disabled:opacity-50"
              accessibilityRole="button" accessibilityLabel="Notes" accessibilityState={{ disabled: isSaving || isAddingItem }}>
              <ArrowLeft size={22} color={colors.foreground} />
            </Pressable>
            <View className="min-w-0 flex-1 flex-row flex-wrap justify-end gap-1">
              <NoteActions isPinned={isPinned} isArchived={isArchived} canDelete={noteId !== null} disabled={isSaving || isAddingItem}
                saving={isSaving} onSave={handleSave} onTogglePin={handleTogglePin} onDelete={handleDelete} onToggleArchive={handleToggleArchive} />
            </View>
          </View>

          {isArchived && <Text className="w-full max-w-md self-center px-4 max-[360px]:px-3 py-2 text-sm text-muted-foreground">Archived · read only</Text>}

          {/* Fill the available writing area and keep growing for longer notes. */}
          <KeyboardAwareScrollView
            ref={scrollRef}
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            bottomOffset={toolbarHeight + 12}
            extraKeyboardSpace={toolbarHeight}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: isArchived ? insets.bottom + 16 : 16 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-md flex-grow self-center">
              <TextInput
                value={title}
                editable={!isArchived && !isSaving}
                onChangeText={(value) => {
                  if (isArchived || mutationInFlightRef.current) return;
                  titleRef.current = value;
                  setTitle(value);
                }}
                accessibilityLabel="Title"
                placeholder="Title"
                placeholderTextColor={colors.mutedForeground}
                className="w-full px-5 max-[360px]:px-4 pt-2 pb-1 text-[26px] leading-8 font-semibold text-foreground"
                multiline
              />


              <NoteAttachments state={attachmentState} readOnly={isArchived} disabled={isSaving || isAddingItem} />
              <View className="mx-5 max-[360px]:mx-4 mt-1">
                {isArchived ? (
                  <EnrichedText selectable htmlStyle={htmlStyle} style={editorStyle} selectionColor={colors.primary}>
                    {initialHtml}
                  </EnrichedText>
                ) : <EnrichedTextInput
                  ref={editorRef}
                  editable={!isSaving}
                  defaultValue={initialHtml}
                  placeholder="Start writing…"
                  placeholderTextColor={colors.mutedForeground}
                  selectionColor={colors.primary}
                  cursorColor={colors.primary}
                  htmlStyle={htmlStyle}
                  style={editorStyle}
                  scrollEnabled={false}
                  textShortcuts={TEXT_SHORTCUTS}
                  onChangeHtml={handleChangeHtml}
                  onFocus={() => {
                    // If the user reaches the editor before the native baseline
                    // is available, never treat their first edit as saved.
                    if (savedSnapshotRef.current === null) contentChangedBeforeSnapshotRef.current = true;
                  }}
                  onChangeState={handleChangeState}
                  onChangeSelection={handleChangeSelection}
                  onChangeText={handleChangeText}
                />}
              </View>

              {showAddItem ? (
                <Pressable
                  onPress={() => {
                    void handleAddListItem();
                  }}
                  disabled={isAddingItem}
                  className="min-h-[44px] flex-row items-center gap-2 px-4 max-[360px]:px-3"
                  android_ripple={{ color: withAlpha(colors.foreground, 0.1) }}
                  accessibilityRole="button"
                  accessibilityLabel="Add item"
                  accessibilityState={{ disabled: isAddingItem }}
                >
                  <Plus size={16} color={colors.mutedForeground} />
                  <Text className="text-sm text-muted-foreground">
                    Add item
                  </Text>
                </Pressable>
              ) : null}
              {!isArchived ? <Pressable
                onPress={() => editorRef.current?.focus()}
                className="flex-grow"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Continue writing"
              /> : <View className="flex-grow" />}
            </View>
          </KeyboardAwareScrollView>

          {/* Pinned toolbar — rides above the software keyboard. */}
          {!isArchived && <KeyboardStickyView
            className="w-full border-t border-border/60 bg-surface-container"
            style={toolbarStyle}
            onLayout={({ nativeEvent }) => setToolbarHeight(nativeEvent.layout.height)}
          >
            {formatToolbar}
          </KeyboardStickyView>}
        </View>
      </View>

      <ConfirmDialog
        visible={confirmState !== null}
        title={
          confirmState?.kind === "delete"
            ? "Delete note"
            : confirmState?.kind === "discard"
              ? "Discard changes?"
              : ""
        }
        message={
          confirmState?.kind === "delete"
            ? "Delete this note?"
            : confirmState?.kind === "discard"
              ? "You have unsaved changes. Leave anyway?"
              : ""
        }
        confirmLabel={
          confirmState?.kind === "delete"
            ? "Delete"
            : confirmState?.kind === "discard"
              ? "Discard changes"
              : "Confirm"
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
