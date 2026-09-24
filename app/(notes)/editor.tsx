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
import { RichText, useEditorBridge } from "@10play/tentap-editor";
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

type FormatButton = {
  type: "bold" | "italic" | "strikethrough" | "bullet" | "numbered" | "checklist";
  labelKey: "notesBold" | "notesItalic" | "notesStrikethrough" | "notesBulletList" | "notesNumberedList" | "notesChecklist";
  icon: typeof Bold;
  action: "toggleBold" | "toggleItalic" | "toggleStrike" | "toggleBulletList" | "toggleOrderedList" | "toggleTaskList";
};

const FORMAT_BUTTONS: FormatButton[] = [
  { type: "bold", labelKey: "notesBold", icon: Bold, action: "toggleBold" },
  { type: "italic", labelKey: "notesItalic", icon: Italic, action: "toggleItalic" },
  {
    type: "strikethrough",
    labelKey: "notesStrikethrough",
    icon: Strikethrough,
    action: "toggleStrike",
  },
  { type: "bullet", labelKey: "notesBulletList", icon: List, action: "toggleBulletList" },
  {
    type: "numbered",
    labelKey: "notesNumberedList",
    icon: ListOrdered,
    action: "toggleOrderedList",
  },
  {
    type: "checklist",
    labelKey: "notesChecklist",
    icon: CheckSquare,
    action: "toggleTaskList",
  },
];

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const suppressChangeRef = useRef(true);
  const editor = useEditorBridge({
    initialContent: "<p></p>",
    avoidIosKeyboard: true,
    onChange: () => {
      if (!suppressChangeRef.current) setIsDirty(true);
    },
  });
  const editorRef = useRef(editor);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);

  useEffect(() => {
    if (loadTarget.kind === "invalid") {
      return;
    }
    if (loadTarget.kind === "new") {
      suppressChangeRef.current = true;
      editorRef.current.setContent("<p></p>");
      requestAnimationFrame(() => {
        suppressChangeRef.current = false;
      });
      return;
    }

    let cancelled = false;
    suppressChangeRef.current = true;
    getNote(loadTarget.id)
      .then((note) => {
        if (cancelled) return;
        if (note) {
          setNoteId(note.id);
          setTitle(note.title);
          setIsPinned(note.is_pinned);
          editorRef.current.setContent(contentToEditorHtml(note.content));
        } else {
          setNoteId(null);
          setTitle("");
          setIsPinned(false);
          editorRef.current.setContent("<p></p>");
          setAsyncLoadFailed(true);
        }
        setIsDirty(false);
        setLoading(false);
        requestAnimationFrame(() => {
          suppressChangeRef.current = false;
        });
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
    setIsSaving(true);
    try {
      const content = await editorRef.current.getHTML();
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

  useEffect(() => {
    editorRef.current.setPlaceholder(t("notesContentPlaceholder"));
  }, [t]);

  const editorCss = useMemo(() => {
    const background = colors.card;
    const foreground = colors.foreground;
    return `
      .ProseMirror {
        background-color: ${background};
        color: ${foreground};
        caret-color: ${foreground};
      }
      .ProseMirror:focus { outline: none; }
      ::selection { background-color: ${colors.primary}; color: ${colors.primaryForeground}; }
      .is-editor-empty:first-child::before { color: ${colors.mutedForeground}; }
      ul[data-type="taskList"] input[type="checkbox"] { accent-color: ${colors.primary}; }
      blockquote { border-left-color: ${colors.border}; }
      hr { border-color: ${colors.border}; }
      pre, code { background-color: ${colors.muted}; color: ${foreground}; }
    `;
  }, [colors.card, colors.foreground, colors.primary, colors.primaryForeground, colors.mutedForeground, colors.border, colors.muted]);

  const [cssApplyTick, setCssApplyTick] = useState(0);

  const handleEditorLoad = useCallback(() => {
    setCssApplyTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const webview = editorRef.current.webviewRef.current;
    if (!webview) return;
    const css = editorCss;
    webview.injectJavaScript(`
      (function () {
        var el = document.getElementById("ph-editor-theme");
        if (!el) {
          el = document.createElement("style");
          el.id = "ph-editor-theme";
          document.head.appendChild(el);
        }
        el.textContent = ${JSON.stringify(css)};
      })();
      true;
    `);
  }, [editorCss, cssApplyTick]);

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
                  className="rounded-lg bg-primary px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t("save")}
                >
                  <Text className="text-sm font-medium text-primary-foreground">{t("save")}</Text>
                </Pressable>
              </View>
            </View>

            <View className="flex-row items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5">
              {FORMAT_BUTTONS.map((button) => (
                <Pressable
                  key={button.type}
                  onPress={() => {
                    editor[button.action]();
                    void haptics.light();
                  }}
                  className="h-9 w-9 items-center justify-center rounded-lg bg-muted"
                  accessibilityRole="button"
                  accessibilityLabel={t(button.labelKey)}
                >
                  <button.icon size={18} color={colors.foreground} />
                </Pressable>
              ))}
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
              <RichText
                editor={editor}
                style={{ flex: 1, minHeight: 240, backgroundColor: colors.card }}
                onLoad={handleEditorLoad}
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
