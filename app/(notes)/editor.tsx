import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2, ArrowLeft, Pin, PinOff } from "lucide-react-native";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
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
import { type NoteColor, NOTE_TEXT_HEX } from "../../src/constants/theme";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import LexicalChecklist from "../../src/components/dom/LexicalChecklist";
import type { LexicalCommandType } from "../../src/components/dom/LexicalChecklist";
import { isLexicalJson, EMPTY_LEXICAL_JSON } from "../../src/lib/lexicalPreview";
import { htmlToLexicalJson } from "../../src/lib/htmlToLexical";

type ConfirmState =
  | { kind: "discard"; action: "back" | "pending" }
  | { kind: "delete" }
  | null;

const COLOR_OPTIONS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

// ── Toolbar button ──────────────────────────────────────────────────
function ToolbarButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof Bold;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-lg bg-muted"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={18} color={colors.foreground} />
    </Pressable>
  );
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

  const [noteId, setNoteId] = useState<number | null>(id ? Number(id) : null);
  const [title, setTitle] = useState("");
  const [contentJson, setContentJson] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(!!id);

  // Toolbar command — incremented to trigger execution in DOM component
  const [command, setCommand] = useState<LexicalCommandType | undefined>(undefined);
  const commandIdRef = useRef(0);

  const sendCommand = useCallback((cmd: LexicalCommandType) => {
    commandIdRef.current += 1;
    setCommand({ ...cmd });
  }, []);

  // Track whether any content has been changed since load
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);
  const suppressDirtyRef = useRef(false);

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
          // Auto-migrate legacy HTML content to Lexical JSON (in memory only)
          let content = n.content;
          if (content && !isLexicalJson(content) && /<[a-z][\s\S]*>/i.test(content)) {
            try {
              content = htmlToLexicalJson(content);
            } catch {
              // Conversion failed — keep original HTML, will be saved on next explicit save
            }
          }
          // Suppress the onChange that fires from programmatic setEditorState
          suppressDirtyRef.current = true;
          setContentJson(content);
          setColor(n.color);
          setIsPinned(n.is_pinned);
        } else {
          setNoteId(null);
          setTitle("");
          setContentJson("");
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
    setContentJson("");
    setColor("default");
    setIsPinned(false);
    setIsDirty(false);
  }, [id]);

  // Guard back navigation when there are unsaved changes
  const handleBack = useCallback(() => {
    if (!isDirty) {
      router.back();
      return;
    }
    setConfirmState({ kind: "discard", action: "back" });
  }, [isDirty, router]);

  // Intercept hardware back button and swipe-back gesture
  const navigation = useNavigation();
  const pendingRemoveActionRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: { preventDefault: () => void; data: { action: { type: string } } }) => {
      if (!isDirty) return;
      if (allowRemoveRef.current) return;
      e.preventDefault();
      pendingRemoveActionRef.current = () => {
        allowRemoveRef.current = true;
        navigation.dispatch(e.data.action as never);
      };
      setConfirmState({ kind: "discard", action: "pending" });
    });
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
      const finalContent = contentJson || EMPTY_LEXICAL_JSON;
      if (noteId) {
        await updateNote(noteId, { title, content: finalContent, color, is_pinned: isPinned });
      } else {
        const created = await createNote({ title, content: finalContent, color, is_pinned: isPinned });
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
  }, [isSaving, noteId, title, contentJson, color, isPinned, router, haptics, t]);

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
  }, [haptics]);

  const handleContentChange = useCallback(async (json: string) => {
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }
    setContentJson(json);
    setIsDirty(true);
  }, []);

  const colorLabels = useMemo(() => ({
    default: t("notesColorDefault"),
    yellow: t("notesColorYellow"),
    green: t("notesColorGreen"),
    blue: t("notesColorBlue"),
    pink: t("notesColorPink"),
    purple: t("notesColorPurple"),
    orange: t("notesColorOrange"),
    red: t("notesColorRed"),
  }), [t]);

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
        keyboardVerticalOffset={insets.top}
      >
        <View className="flex-1 bg-background">
          {/* Toolbar */}
          <View className="flex-row items-center gap-1 border-t border-border bg-card px-2 py-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, flexGrow: 1, justifyContent: "center" }}>
              <ToolbarButton icon={Bold} label="Bold" onPress={() => sendCommand({ type: "bold" })} />
              <ToolbarButton icon={Italic} label="Italic" onPress={() => sendCommand({ type: "italic" })} />
              <ToolbarButton icon={Strikethrough} label="Strikethrough" onPress={() => sendCommand({ type: "strikethrough" })} />
              <ToolbarButton icon={Underline} label="Underline" onPress={() => sendCommand({ type: "underline" })} />
              <ToolbarButton icon={List} label="Bullet list" onPress={() => sendCommand({ type: "bulletList" })} />
              <ToolbarButton icon={ListOrdered} label="Ordered list" onPress={() => sendCommand({ type: "orderedList" })} />
              <ToolbarButton icon={CheckSquare} label="Check list" onPress={() => sendCommand({ type: "checkList" })} />
            </ScrollView>
          </View>

          <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1 }} keyboardDismissMode="on-drag">
            <View className="w-full max-w-md self-center gap-4 p-4 pb-8">
              {/* Header */}
              <View className="flex-row items-center justify-between">
                <Pressable onPress={handleBack} className="p-1" accessibilityRole="button" accessibilityLabel={t("cancel")}>
                  <ArrowLeft size={24} color={colors.foreground} />
                </Pressable>
                <View className="flex-row items-center gap-2">
                  <Pressable onPress={handleTogglePin} className="p-2" accessibilityRole="button" accessibilityLabel={isPinned ? t("notesUnpin") : t("notesPin")}>
                    {isPinned ? (
                      <Pin size={20} color={colors.foreground} />
                    ) : (
                      <PinOff size={20} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                  {noteId && (
                    <Pressable onPress={handleDelete} className="p-2" accessibilityRole="button" accessibilityLabel={t("notesDelete")}>
                      <Trash2 size={20} color={colors.destructive} />
                    </Pressable>
                  )}
                  <Pressable onPress={handleSave} className="rounded-lg bg-primary px-4 py-2" accessibilityRole="button" accessibilityLabel={t("save")}>
                    <Text className="text-sm font-medium text-primary-foreground">{t("save")}</Text>
                  </Pressable>
                </View>
              </View>

              {/* Color Picker */}
              <View className="flex-row items-center gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => { setColor(c); setIsDirty(true); }}
                    className={`h-7 w-7 rounded-full border-2 ${
                      color === c ? "border-primary" : "border-border"
                    } ${getNoteColorClass(c, isDark)}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: color === c }}
                    accessibilityLabel={colorLabels[c]}
                  />
                ))}
              </View>

              {/* Title */}
              <TextInput
                value={title}
                onChangeText={(v) => { setTitle(v); setIsDirty(true); }}
                placeholder={t("notesUntitled")}
                placeholderTextColor={colors.mutedForeground}
                className={`rounded-xl border border-border bg-card px-4 py-3 text-lg font-bold ${getNoteTextColorClass(color, isDark)}`}
                multiline
              />

              {/* Lexical Editor (DOM Component) */}
              <View className="rounded-xl border border-border bg-card overflow-hidden">
                <LexicalChecklist
                  key={noteId || "new"}
                  initialJson={contentJson}
                  colorScheme={isDark ? "dark" : "light"}
                  onChange={handleContentChange}
                  command={command}
                />
              </View>
            </View>
          </ScrollView>
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
            : confirmState?.kind === "discard"
              ? handleConfirmDiscard
              : () => setConfirmState(null)
        }
      />
    </>
  );
}
