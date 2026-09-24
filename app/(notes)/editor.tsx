import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Trash2,
  ArrowLeft,
  Pin,
  PinOff,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  CheckSquare,
} from "../../src/components/AppIcons";
import { EnrichedTextInput } from "react-native-enriched-html";
import type {
  EnrichedTextInputInstance,
  HtmlStyle,
  OnChangeStateEvent,
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
import { contentToEditorHtml } from "../../src/lib/noteContent";

type ConfirmState =
  | { kind: "discard"; action: "back" | "pending" }
  | { kind: "delete" }
  | null;

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
    icon: CheckSquare,
    stateKey: "checkboxList",
    toggle: (editor) => editor.toggleCheckboxList(false),
  },
];

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const editorRef = useRef<EnrichedTextInputInstance>(null);
  const suppressChangeRef = useRef(true);
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
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);

  const htmlStyle = useMemo<HtmlStyle>(
    () => ({
      h1: { fontSize: 28, bold: true },
      h2: { fontSize: 22, bold: true },
      h3: { fontSize: 18, bold: true },
      blockquote: { borderColor: colors.border, color: colors.mutedForeground },
      codeblock: { backgroundColor: colors.muted, color: colors.foreground },
      code: { backgroundColor: colors.muted, color: colors.foreground },
      a: { color: colors.primary },
      ul: { bulletColor: colors.foreground },
      ol: { markerColor: colors.foreground },
      ulCheckbox: { boxColor: colors.primary, boxSize: 18 },
    }),
    [colors.border, colors.mutedForeground, colors.muted, colors.foreground, colors.primary]
  );

  useEffect(() => {
    if (loadTarget.kind !== "note") return;

    let cancelled = false;
    suppressChangeRef.current = true;
    getNote(loadTarget.id)
      .then((note) => {
        if (cancelled) return;
        if (note) {
          setNoteId(note.id);
          setTitle(note.title);
          setIsPinned(note.is_pinned);
          setInitialHtml(contentToEditorHtml(note.content));
        } else {
          setNoteId(null);
          setTitle("");
          setIsPinned(false);
          setInitialHtml("<p></p>");
          setAsyncLoadFailed(true);
        }
        setIsDirty(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setAsyncLoadFailed(true);
        suppressChangeRef.current = false;
        toast.error(t("errorLoadingData"));
      });

    return () => {
      cancelled = true;
    };
  }, [loadTarget, t]);

  useEffect(() => {
    if (loading || loadFailed) return;
    suppressChangeRef.current = true;
    const frame = requestAnimationFrame(() => {
      suppressChangeRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, loadFailed, initialHtml]);

  const handleChangeHtml = useCallback(() => {
    if (!suppressChangeRef.current) setIsDirty(true);
  }, []);

  const handleChangeState = useCallback((event: { nativeEvent: OnChangeStateEvent }) => {
    setStyleState(event.nativeEvent);
  }, []);

  const handleBack = useCallback(() => {
    if (!isDirty) {
      router.back();
      return;
    }
    setConfirmState({ kind: "discard", action: "back" });
  }, [isDirty, router]);

  const navigation = useNavigation();
  const pendingRemoveActionRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (event: {
        preventDefault: () => void;
        data: { action: { type: string } };
      }) => {
        if (!isDirty || allowRemoveRef.current) return;
        event.preventDefault();
        pendingRemoveActionRef.current = () => {
          allowRemoveRef.current = true;
          navigation.dispatch(event.data.action as never);
        };
        setConfirmState({ kind: "discard", action: "pending" });
      }
    );
    return unsubscribe;
  }, [isDirty, navigation]);

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
      const content = await editor.getHTML();
      if (noteId) {
        await updateNote(noteId, { title, content, is_pinned: isPinned });
      } else {
        const created = await createNote({ title, content, is_pinned: isPinned });
        setNoteId(created.id);
      }
      setIsDirty(false);
      void haptics.success();
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
    setIsDirty(true);
  }, [haptics]);

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
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 48}
      >
        <View className="flex-1 bg-background">
          <View className="w-full max-w-md flex-1 self-center gap-3 p-4 pb-8">
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={handleBack}
                className="p-1"
                accessibilityRole="button"
                accessibilityLabel={t("cancel")}
              >
                <ArrowLeft size={24} color={colors.foreground} />
              </Pressable>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={handleTogglePin}
                  className="p-3"
                  accessibilityRole="button"
                  accessibilityLabel={isPinned ? t("notesUnpin") : t("notesPin")}
                >
                  {isPinned ? (
                    <Pin size={20} color={colors.foreground} />
                  ) : (
                    <PinOff size={20} color={colors.mutedForeground} />
                  )}
                </Pressable>
                {noteId ? (
                  <Pressable
                    onPress={handleDelete}
                    className="p-3"
                    accessibilityRole="button"
                    accessibilityLabel={t("notesDelete")}
                  >
                    <Trash2 size={20} color={colors.destructive} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={handleSave}
                  disabled={isSaving}
                  className={`rounded-lg px-4 py-2 ${!isSaving ? "bg-primary" : "bg-primary/50"}`}
                  accessibilityRole="button"
                  accessibilityLabel={t("save")}
                  accessibilityState={{ disabled: isSaving }}
                >
                  <Text className="text-sm font-medium text-primary-foreground">{t("save")}</Text>
                </Pressable>
              </View>
            </View>

            <View className="flex-row items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5">
              {FORMAT_BUTTONS.map((button) => {
                const state = styleState?.[button.stateKey];
                const active = state?.isActive ?? false;
                const blocked = state?.isBlocking ?? false;
                return (
                  <Pressable
                    key={button.type}
                    onPress={() => {
                      const editor = editorRef.current;
                      if (!editor || blocked) return;
                      button.toggle(editor);
                      void haptics.light();
                    }}
                    disabled={blocked}
                    className={`h-9 w-9 items-center justify-center rounded-lg ${
                      active ? "bg-primary" : blocked ? "bg-muted/40" : "bg-muted"
                    }`}
                    accessibilityRole="button"
                    accessibilityLabel={t(button.labelKey)}
                    accessibilityState={{ selected: active, disabled: blocked }}
                  >
                    <button.icon
                      size={18}
                      color={active ? colors.primaryForeground : colors.foreground}
                    />
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                setIsDirty(true);
              }}
              placeholder={t("notesUntitled")}
              placeholderTextColor={colors.mutedForeground}
              className="rounded-xl border border-border bg-card px-4 py-3 text-lg font-bold text-foreground"
              multiline
            />

            <View className="min-h-[240px] flex-1 overflow-hidden rounded-xl border border-border bg-card">
              <EnrichedTextInput
                ref={editorRef}
                defaultValue={initialHtml}
                placeholder={t("notesContentPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.primary}
                cursorColor={colors.primary}
                htmlStyle={htmlStyle}
                style={{
                  flex: 1,
                  minHeight: 240,
                  backgroundColor: colors.card,
                  color: colors.foreground,
                  fontSize: 16,
                }}
                scrollEnabled
                onChangeHtml={handleChangeHtml}
                onChangeState={handleChangeState}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

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
