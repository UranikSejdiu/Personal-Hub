import { useEffect, useState, useCallback, startTransition } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { FileText, Plus, Search, XCircle, Pin } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useI18n } from "../../src/lib/i18n";
import { loadNotes, searchNotes, type Note } from "../../src/lib/notes";
import { NOTE_COLORS, type NoteColor } from "../../src/constants/theme";
import { useTheme, useThemeColors } from "../../src/lib/theme";

function getNoteColorClass(color: NoteColor, isDark: boolean): string {
  const entry = NOTE_COLORS[color];
  if (!entry) return "bg-card";
  return isDark ? entry.dark : entry.light;
}

export default function NotesListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = useThemeColors();
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
    startTransition(() => {
      void load();
    });
  }, [load]);

  const handleNew = useCallback(async () => {
    router.push("/(notes)/editor");
  }, [router]);

  const handleNotePress = useCallback(
    (note: Note) => {
      router.push({ pathname: "/(notes)/editor", params: { id: note.id } });
    },
    [router]
  );

  return (
    <ScrollView >
      <View >
        <View >
          <Text >{t("notesTitle")}</Text>
          <Pressable
            onPress={handleNew}
            >
            <Plus size={14} color={colors.primaryForeground} />
            <Text >{t("notesNew")}</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View >
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("notesSearchPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <XCircle size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {notes.length === 0 ? (
          <View >
            <FileText size={40} color={colors.mutedForeground} />
            <Text >
              {searchQuery ? t("notesNoResults") : t("notesEmpty")}
            </Text>
            {!searchQuery && (
              <Text >{t("notesEmptyHint")}</Text>
            )}
          </View>
        ) : (
          <View >
            {notes.map((note) => (
              <Pressable
                key={note.id}
                onPress={() => handleNotePress(note)}
                className={`rounded-xl border border-border p-4 ${getNoteColorClass(note.color, isDark)}`}
              >
                <View >
                  <View >
                    <Text numberOfLines={1}>
                      {note.title || t("notesUntitled")}
                    </Text>
                    <Text numberOfLines={2}>
                      {note.content || "—"}
                    </Text>
                  </View>
                  {note.is_pinned && (
                    <Pin size={16} color={colors.mutedForeground} />
                  )}
                </View>
                <View >
                  <Text >
                    {note.updated_at ? new Date(note.updated_at).toLocaleDateString() : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
