import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Trash2, ArrowLeft, Pin, PinOff } from "lucide-react-native";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { toast } from "sonner-native";
import { EnrichedTextInput } from "react-native-enriched-html";
import type { EnrichedTextInputInstance, OnChangeStateEvent } from "react-native-enriched-html";
import { useI18n } from "../../src/lib/i18n";
import {
  getNote,
  createNote,
  updateNote,
  deleteNote,
  getNoteColorClass,
} from "../../src/lib/notes";
import { type NoteColor } from "../../src/constants/theme";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { RichTextToolbar } from "../../src/components/RichTextToolbar";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

type ConfirmState =
  | { kind: "discard"; action: "back" | "pending" }
  | { kind: "delete" }
  | null;

const COLOR_OPTIONS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme === "dark";
  const editorRef = useRef<EnrichedTextInputInstance>(null);

  const [noteId, setNoteId] = useState<number | null>(id ? Number(id) : null);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [editorState, setEditorState] = useState<OnChangeStateEvent | null>(null);

  // Track whether any content has been changed since load
  const [isDirty, setIsDirty] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const allowRemoveRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getNote(Number(id))
      .then((n) => {
        if (cancelled) return;
        if (n) {
          setNoteId(n.id);
          setTitle(n.title);
          setContentHtml(n.content);
          setColor(n.color);
          setIsPinned(n.is_pinned);
        } else {
          setNoteId(null);
          setTitle("");
          setContentHtml("");
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
    setContentHtml("");
    setColor("default");
    setIsPinned(false);
    setEditorState(null);
    setIsDirty(false);
    editorRef.current?.setValue("");
  }, [id]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.setValue(contentHtml);
  }, [contentHtml]);

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
    try {
      const html = await editorRef.current?.getHTML();
      const finalContent = html ?? contentHtml;
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
    }
  }, [noteId, title, contentHtml, color, isPinned, router, haptics, t]);

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
      toast.error(t("saveFailed"));
    }
  }, [noteId, router, haptics, t]);

  const handleTogglePin = useCallback(() => {
    void haptics.light();
    setIsPinned((prev) => !prev);
  }, [haptics]);

  const handleEditorStateChange = useCallback((e: { nativeEvent: OnChangeStateEvent }) => {
    setEditorState(e.nativeEvent);
    setIsDirty(true);
  }, []);

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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <View className="flex-1 bg-background">
          <RichTextToolbar
            state={editorState}
            onBold={() => editorRef.current?.toggleBold()}
            onItalic={() => editorRef.current?.toggleItalic()}
            onStrikethrough={() => editorRef.current?.toggleStrikeThrough()}
            onUnderline={() => editorRef.current?.toggleUnderline()}
            onH1={() => editorRef.current?.toggleH1()}
            onH2={() => editorRef.current?.toggleH2()}
            onBulletList={() => editorRef.current?.toggleUnorderedList()}
            onOrderedList={() => editorRef.current?.toggleOrderedList()}
            onCheckboxList={() => editorRef.current?.toggleCheckboxList(false)}
          />

          <ScrollView className="flex-1 bg-background">
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
                    accessibilityLabel={c}
                  />
                ))}
              </View>

              {/* Title */}
              <TextInput
                value={title}
                onChangeText={(v) => { setTitle(v); setIsDirty(true); }}
                placeholder={t("notesUntitled")}
                placeholderTextColor={colors.mutedForeground}
                className={`rounded-xl border border-border px-4 py-3 text-lg font-bold text-foreground ${getNoteColorClass(color, isDark)}`}
                multiline
              />

              {/* Rich Text Editor */}
              <View className={`rounded-xl border border-border overflow-hidden ${getNoteColorClass(color, isDark)}`}>
                <EnrichedTextInput
                  ref={editorRef}
                  defaultValue=""
                  placeholder={t("notesContentPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  onChangeState={handleEditorStateChange}
                  scrollEnabled={false}
                  style={{
                    minHeight: 200,
                    padding: 16,
                    fontSize: 14,
                    color: isDark ? "#e5e7eb" : "#1f2937",
                  }}
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
