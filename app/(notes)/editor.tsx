import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Trash2, ArrowLeft, Pin, PinOff } from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
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

const COLOR_OPTIONS: NoteColor[] = ["default", "yellow", "green", "blue", "pink", "purple", "orange", "red"];

export default function NotesEditorScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme === "dark";

  const [noteId, setNoteId] = useState<number | null>(id ? Number(id) : null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<NoteColor>("default");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (id) {
      getNote(Number(id)).then((n) => {
        if (n) {
          setNoteId(n.id);
          setTitle(n.title);
          setContent(n.content);
          setColor(n.color);
          setIsPinned(n.is_pinned);
        }
        setLoading(false);
      });
    }
  }, [id]);

  const handleSave = useCallback(async () => {
    if (noteId) {
      await updateNote(noteId, { title, content, color, is_pinned: isPinned });
    } else {
      const created = await createNote({ title, content, color, is_pinned: isPinned });
      setNoteId(created.id);
    }
    void haptics.success();
    router.back();
  }, [noteId, title, content, color, isPinned, router, haptics]);

  const handleDelete = useCallback(() => {
    if (!noteId) return;
    Alert.alert(t("notesDelete"), t("notesDeleteConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await deleteNote(noteId);
          void haptics.light();
          router.back();
        },
      },
    ]);
  }, [noteId, t, router, haptics]);

  const handleTogglePin = useCallback(() => {
    void haptics.light();
    setIsPinned((prev) => !prev);
  }, [haptics]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
          {/* Header */}
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => router.back()} className="p-1">
              <ArrowLeft size={24} color={colors.foreground} />
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable onPress={handleTogglePin} className="p-2">
                 {isPinned ? (
                   <Pin size={20} color={colors.foreground} />
                 ) : (
                   <PinOff size={20} color={colors.mutedForeground} />
                 )}
              </Pressable>
              {noteId && (
                <Pressable onPress={handleDelete} className="p-2">
                  <Trash2 size={20} color={colors.destructive} />
                </Pressable>
              )}
              <Pressable onPress={handleSave} className="rounded-lg bg-primary px-4 py-2">
                <Text className="text-sm font-medium text-primary-foreground">{t("save")}</Text>
              </Pressable>
            </View>
          </View>

          {/* Color Picker */}
          <View className="flex-row items-center gap-2">
            {COLOR_OPTIONS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === c ? "border-primary" : "border-border"
                } ${getNoteColorClass(c, isDark)}`}
              />
            ))}
          </View>

          {/* Title */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("notesUntitled")}
            placeholderTextColor={colors.mutedForeground}
            className={`rounded-xl border border-border px-4 py-3 text-lg font-bold text-foreground ${getNoteColorClass(color, isDark)}`}
            multiline
          />

          {/* Content */}
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholderTextColor={colors.mutedForeground}
            className={`rounded-xl border border-border px-4 py-3 text-sm text-foreground ${getNoteColorClass(color, isDark)}`}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 300 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
