import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2, ArrowLeft, Pin, PinOff } from "lucide-react-native";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  CheckSquare,
} from "lucide-react-native";
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
import { contentToMarkdown } from "../../src/lib/noteContent";

type ConfirmState =
  | { kind: "discard"; action: "back" | "pending" }
  | { kind: "delete" }
  | null;

const COLOR_OPTIONS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

interface SelectionRange {
  start: number;
  end: number;
}

function wrapInline(
  content: string,
  sel: SelectionRange,
  marker: string
): [string, SelectionRange] {
  const selected = content.substring(sel.start, sel.end);
  const before = content.substring(0, sel.start);
  const after = content.substring(sel.end);
  const isWrapped =
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    selected.length > marker.length * 2;
  if (isWrapped) {
    const inner = selected.substring(
      marker.length,
      selected.length - marker.length
    );
    const newText = before + inner + after;
    return [newText, { start: sel.start, end: sel.end - marker.length * 2 }];
  }
  const wrapped = marker + selected + marker;
  const newText = before + wrapped + after;
  return [
    newText,
    { start: sel.start + marker.length, end: sel.end + marker.length },
  ];
}

function toggleLinePrefix(
  content: string,
  sel: SelectionRange,
  prefix: string
): [string, SelectionRange] {
  const lineStart = content.lastIndexOf("\n", sel.start - 1) + 1;
  const lineEnd = content.indexOf("\n", sel.end);
  const actualEnd = lineEnd === -1 ? content.length : lineEnd;
  const line = content.substring(lineStart, actualEnd);
  const hasPrefix = line.startsWith(prefix);
  let newLine: string;
  let delta: number;
  if (hasPrefix) {
    newLine = line.substring(prefix.length);
    delta = -prefix.length;
  } else {
    newLine = prefix + line;
    delta = prefix.length;
  }
  const newText =
    content.substring(0, lineStart) + newLine + content.substring(actualEnd);
  return [
    newText,
    {
      start: Math.max(lineStart, sel.start + delta),
      end: Math.max(lineStart, sel.end + delta),
    },
  ];
}

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const contentRef = useRef<TextInput>(null);

  const [noteId, setNoteId] = useState<number | null>(id ? Number(id) : null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [selection, setSelection] = useState<SelectionRange>({
    start: 0,
    end: 0,
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);

    getNote(Number(id))
      .then((n) => {
        if (cancelled) return;
        if (n) {
          setNoteId(n.id);
          setTitle(n.title);
          setContent(contentToMarkdown(n.content));
          setColor(n.color);
          setIsPinned(n.is_pinned);
        } else {
          setNoteId(null);
          setTitle("");
          setContent("");
          setColor("default");
          setIsPinned(false);
        }
        setIsDirty(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        toast.error(t("errorLoadingData"));
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  useEffect(() => {
    if (id) return;
    setNoteId(null);
    setTitle("");
    setContent("");
    setColor("default");
    setIsPinned(false);
    setIsDirty(false);
  }, [id]);

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
      (e: {
        preventDefault: () => void;
        data: { action: { type: string } };
      }) => {
        if (!isDirty) return;
        if (allowRemoveRef.current) return;
        e.preventDefault();
        pendingRemoveActionRef.current = () => {
          allowRemoveRef.current = true;
          navigation.dispatch(e.data.action as never);
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
      if (noteId) {
        await updateNote(noteId, {
          title,
          content,
          color,
          is_pinned: isPinned,
        });
      } else {
        const created = await createNote({
          title,
          content,
          color,
          is_pinned: isPinned,
        });
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
  }, [isSaving, noteId, title, content, color, isPinned, router, haptics, t]);

  const handleDelete = useCallback(() => {
    if (!noteId) return;
    setConfirmState({ kind: "delete" });
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
  }, [noteId, router, haptics, t]);

  const handleTogglePin = useCallback(() => {
    void haptics.light();
    setIsPinned((prev) => !prev);
    setIsDirty(true);
  }, [haptics]);

  const applyFormat = useCallback(
    (type: "bold" | "italic" | "strikethrough" | "bullet" | "numbered" | "checklist") => {
      const sel = selection;
      switch (type) {
        case "bold": {
          const [newText, newSel] = wrapInline(content, sel, "**");
          setContent(newText);
          setSelection(newSel);
          break;
        }
        case "italic": {
          const [newText, newSel] = wrapInline(content, sel, "*");
          setContent(newText);
          setSelection(newSel);
          break;
        }
        case "strikethrough": {
          const [newText, newSel] = wrapInline(content, sel, "~~");
          setContent(newText);
          setSelection(newSel);
          break;
        }
        case "bullet": {
          const [newText, newSel] = toggleLinePrefix(content, sel, "• ");
          setContent(newText);
          setSelection(newSel);
          break;
        }
        case "numbered": {
          const [newText, newSel] = toggleLinePrefix(content, sel, "1. ");
          setContent(newText);
          setSelection(newSel);
          break;
        }
        case "checklist": {
          const [newText, newSel] = toggleLinePrefix(content, sel, "☐ ");
          setContent(newText);
          setSelection(newSel);
          break;
        }
      }
      setIsDirty(true);
      setTimeout(() => contentRef.current?.focus(), 50);
    },
    [content, selection]
  );

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
          <View className="w-full max-w-md self-center gap-3 p-4 pb-8">
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
                  accessibilityLabel={
                    isPinned ? t("notesUnpin") : t("notesPin")
                  }
                >
                  {isPinned ? (
                    <Pin size={20} color={colors.foreground} />
                  ) : (
                    <PinOff size={20} color={colors.mutedForeground} />
                  )}
                </Pressable>
                {noteId && (
                  <Pressable
                    onPress={handleDelete}
                    className="p-2"
                    accessibilityRole="button"
                    accessibilityLabel={t("notesDelete")}
                  >
                    <Trash2 size={20} color={colors.destructive} />
                  </Pressable>
                )}
                <Pressable
                  onPress={handleSave}
                  className="rounded-lg bg-primary px-4 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t("save")}
                >
                  <Text className="text-sm font-medium text-primary-foreground">
                    {t("save")}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="flex-row items-center gap-2">
              {COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    setColor(c);
                    setIsDirty(true);
                  }}
                  className={`h-7 w-7 rounded-full border-2 ${
                    color === c ? "border-primary" : "border-border"
                  } ${getNoteColorClass(c, isDark)}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: color === c }}
                  accessibilityLabel={colorLabels[c]}
                />
              ))}
            </View>

            <View className="flex-row items-center gap-1 rounded-xl border border-border bg-card px-2 py-1.5">
              {[
                { icon: Bold, label: "Bold", type: "bold" as const },
                { icon: Italic, label: "Italic", type: "italic" as const },
                { icon: Strikethrough, label: "Strikethrough", type: "strikethrough" as const },
                { icon: List, label: "Bullet list", type: "bullet" as const },
                { icon: ListOrdered, label: "Numbered list", type: "numbered" as const },
                { icon: CheckSquare, label: "Checklist", type: "checklist" as const },
              ].map((btn) => (
                <Pressable
                  key={btn.type}
                  onPress={() => applyFormat(btn.type)}
                  className="h-9 w-9 items-center justify-center rounded-lg bg-muted"
                  accessibilityRole="button"
                  accessibilityLabel={btn.label}
                >
                  <btn.icon size={18} color={colors.foreground} />
                </Pressable>
              ))}
            </View>

            <TextInput
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setIsDirty(true);
              }}
              placeholder={t("notesUntitled")}
              placeholderTextColor={colors.mutedForeground}
              className={`rounded-xl border border-border bg-card px-4 py-3 text-lg font-bold ${getNoteTextColorClass(color, isDark)}`}
              multiline
            />

            <TextInput
              ref={contentRef}
              value={content}
              onChangeText={(v) => {
                setContent(v);
                setIsDirty(true);
              }}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              placeholder={t("notesContentPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              className={`rounded-xl border border-border bg-card px-4 py-3 text-base min-h-[200px] ${getNoteTextColorClass(color, isDark)}`}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
            />
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
        onConfirm={
          confirmState?.kind === "delete"
            ? handleConfirmDelete
            : handleConfirmDiscard
        }
      />
    </>
  );
}
