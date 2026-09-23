import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, TextInput, KeyboardAvoidingView } from "react-native";
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
  getNoteColorClass,
  getNoteTextColorClass,
} from "../../src/lib/notes";
import { type NoteColor } from "../../src/constants/theme";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { contentToEditorHtml } from "../../src/lib/noteContent";

type ConfirmState =
  | { kind: "discard"; action: "back" | "pending" }
  | { kind: "delete" }
  | null;

const COLOR_OPTIONS: NoteColor[] = [
  "default",
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
  "red",
];

type FormatButton = {
  type: "bold" | "italic" | "strikethrough" | "bullet" | "numbered" | "checklist";
  label: string;
  icon: typeof Bold;
  action: "toggleBold" | "toggleItalic" | "toggleStrike" | "toggleBulletList" | "toggleOrderedList" | "toggleTaskList";
};

const FORMAT_BUTTONS: FormatButton[] = [
  { type: "bold", label: "Bold", icon: Bold, action: "toggleBold" },
  { type: "italic", label: "Italic", icon: Italic, action: "toggleItalic" },
  {
    type: "strikethrough",
    label: "Strikethrough",
    icon: Strikethrough,
    action: "toggleStrike",
  },
  { type: "bullet", label: "Bullet list", icon: List, action: "toggleBulletList" },
  {
    type: "numbered",
    label: "Numbered list",
    icon: ListOrdered,
    action: "toggleOrderedList",
  },
  {
    type: "checklist",
    label: "Checklist",
    icon: CheckSquare,
    action: "toggleTaskList",
  },
];

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const suppressChangeRef = useRef(true);
  const editor = useEditorBridge({
    initialContent: "<p></p>",
    avoidIosKeyboard: true,
    onChange: () => {
      if (!suppressChangeRef.current) setIsDirty(true);
    },
  });

  const [noteId, setNoteId] = useState<number | null>(id ? Number(id) : null);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);

  useEffect(() => {
    if (!id) {
      suppressChangeRef.current = true;
      editor.setContent("<p></p>");
      requestAnimationFrame(() => {
        suppressChangeRef.current = false;
      });
      return;
    }

    let cancelled = false;
    suppressChangeRef.current = true;
    getNote(Number(id))
      .then((note) => {
        if (cancelled) return;
        if (note) {
          setNoteId(note.id);
          setTitle(note.title);
          setColor(note.color);
          setIsPinned(note.is_pinned);
          editor.setContent(contentToEditorHtml(note.content));
        } else {
          setNoteId(null);
          setTitle("");
          setColor("default");
          setIsPinned(false);
          editor.setContent("<p></p>");
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
        suppressChangeRef.current = false;
        toast.error(t("errorLoadingData"));
      });

    return () => {
      cancelled = true;
    };
  }, [editor, id, t]);

  const [previousId, setPreviousId] = useState(id);
  if (previousId !== id) {
    setPreviousId(id);
    if (!id) {
      setNoteId(null);
      setTitle("");
      setColor("default");
      setIsPinned(false);
      setIsDirty(false);
    }
  }

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
    if (isSaving) return;
    setIsSaving(true);
    try {
      const content = await editor.getHTML();
      if (noteId) {
        await updateNote(noteId, { title, content, color, is_pinned: isPinned });
      } else {
        const created = await createNote({ title, content, color, is_pinned: isPinned });
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
  }, [color, editor, haptics, isPinned, isSaving, noteId, router, t, title]);

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

  const colorLabels = useMemo(
    () => ({
      default: t("notesColorDefault"),
      yellow: t("notesColorYellow"),
      green: t("notesColorGreen"),
      blue: t("notesColorBlue"),
      pink: t("notesColorPink"),
      purple: t("notesColorPurple"),
      orange: t("notesColorOrange"),
      red: t("notesColorRed"),
    }),
    [t]
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior="padding"
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
                  className="p-2"
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
                    className="p-2"
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

            <View className="flex-row items-center gap-2">
              {COLOR_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setColor(option);
                    setIsDirty(true);
                  }}
                  className={`h-7 w-7 rounded-full border-2 ${
                    color === option ? "border-primary" : "border-border"
                  } ${getNoteColorClass(option, isDark)}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: color === option }}
                  accessibilityLabel={colorLabels[option]}
                />
              ))}
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
                  accessibilityLabel={button.label}
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
              className={`rounded-xl border border-border bg-card px-4 py-3 text-lg font-bold ${getNoteTextColorClass(color, isDark)}`}
              multiline
            />

            <View className="min-h-[240px] flex-1 overflow-hidden rounded-xl border border-border bg-card">
              <RichText
                editor={editor}
                style={{ flex: 1, minHeight: 240, backgroundColor: colors.card }}
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
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.kind === "delete" ? handleConfirmDelete : handleConfirmDiscard}
      />
    </>
  );
}
