import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, TextInput } from "react-native";
import { FileText, Plus, Search, XCircle, Pin } from "lucide-react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useI18n } from "../../src/lib/i18n";
import { loadNotes, searchNotes, getNoteColorClass, stripHtml, type Note } from "../../src/lib/notes";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";

export default function NotesListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme === "dark";
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    if (searchQuery.trim()) {
      setNotes(await searchNotes(searchQuery.trim()));
    } else {
      setNotes(await loadNotes());
    }
  }, [searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleNew = useCallback(async () => {
    router.push("/(notes)/editor");
  }, [router]);

  const handleNotePress = useCallback(
    (note: Note) => {
      void haptics.light();
      router.push({ pathname: "/(notes)/editor", params: { id: note.id } });
    },
    [router, haptics]
  );

  const renderItem = useCallback(
    ({ item: note }: { item: Note }) => (
      <Pressable
        onPress={() => handleNotePress(note)}
        className={`rounded-xl border border-border p-4 ${getNoteColorClass(note.color, isDark)}`}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 gap-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
              {note.title || t("notesUntitled")}
            </Text>
            <Text numberOfLines={2} className="text-xs text-muted-foreground">
              {stripHtml(note.content) || "—"}
            </Text>
          </View>
          {note.is_pinned && (
            <Pin size={14} color={colors.mutedForeground} className="ml-2 mt-0.5" />
          )}
        </View>
        <View className="mt-2 flex-row items-center justify-end">
          <Text className="text-[10px] text-muted-foreground">
            {note.updated_at ? new Date(note.updated_at.replace(" ", "T")).toLocaleDateString() : ""}
          </Text>
        </View>
      </Pressable>
    ),
    [handleNotePress, isDark, colors.mutedForeground, t]
  );

  const keyExtractor = useCallback((item: Note) => String(item.id), []);

  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">{t("notesTitle")}</Text>
          <Pressable
            onPress={handleNew}
            className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-2"
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="text-sm font-medium text-primary-foreground">{t("notesNew")}</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("notesSearchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            className="flex-1 text-sm text-foreground"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <XCircle size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Notes list */}
        {notes.length === 0 ? (
          <View className="items-center gap-3 py-20">
            <FileText size={40} color={colors.mutedForeground} />
            <Text className="text-sm text-muted-foreground">
              {searchQuery ? t("notesNoResults") : t("notesEmpty")}
            </Text>
            {!searchQuery && (
              <Text className="text-xs text-muted-foreground">{t("notesEmptyHint")}</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={notes}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={{ gap: 8 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}
