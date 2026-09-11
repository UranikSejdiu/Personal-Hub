import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, Pressable, TextInput } from "react-native";
import { FileText, Plus, Search, XCircle, Pin } from "lucide-react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useI18n } from "../../src/lib/i18n";
import {
  loadNotes,
  searchNotes,
  getNoteTextColorClass,
  getNoteColorClass,
  type Note,
} from "../../src/lib/notes";
import { getNotePreviewText } from "../../src/lib/lexicalPreview";
import { useTheme, useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";

function splitIntoColumns(items: Note[], count: number): Note[][] {
  const cols: Note[][] = Array.from({ length: count }, () => []);
  for (const item of items) {
    cols[0].push(item);
    cols.sort((a, b) => a.length - b.length);
  }
  return cols;
}

function NoteCard({
  note,
  isDark,
  onPress,
}: {
  note: Note;
  isDark: boolean;
  onPress: () => void;
}) {
  const textColorClass = getNoteTextColorClass(note.color, isDark);
  const colors = useThemeColors();
  const bgColorClass = getNoteColorClass(note.color, isDark);

  return (
    <Pressable
      onPress={onPress}
      className={`relative mb-2 rounded-lg border border-border/50 p-3 ${bgColorClass}`}
    >
      {note.is_pinned ? (
        <View className="absolute top-2 right-2">
          <Pin size={12} color={colors.mutedForeground} />
        </View>
      ) : null}
      {note.title ? (
        <Text
          numberOfLines={2}
          className={`text-base font-medium ${textColorClass}`}
        >
          {note.title}
        </Text>
      ) : null}
      {note.content ? (
        <View style={{ marginTop: 6 }}>
          {getNotePreviewText(note.content, 3).map((line, i) => (
            <Text
              key={i}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: isDark ? "#e5e7eb" : "#374151",
              }}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function NotesListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const isDark = theme === "dark";
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (query?: string) => {
    try {
      setLoadError(null);
      const q = query ?? searchQuery;
      if (q.trim()) {
        setNotes(await searchNotes(q.trim()));
      } else {
        setNotes(await loadNotes());
      }
    } catch {
      setNotes([]);
      setLoadError("Failed to load notes");
    }
  }, [searchQuery]);

  const debouncedSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void load(query);
      }, 300);
    },
    [load]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleNew = useCallback(() => {
    router.push("/(notes)/editor");
  }, [router]);

  const handleNotePress = useCallback(
    (note: Note) => {
      void haptics.light();
      router.push({ pathname: "/(notes)/editor", params: { id: note.id } });
    },
    [router, haptics]
  );

  const pinnedNotes = useMemo(
    () => notes.filter((n) => n.is_pinned),
    [notes]
  );
  const otherNotes = useMemo(
    () => notes.filter((n) => !n.is_pinned),
    [notes]
  );

  const pinnedCols = useMemo(() => splitIntoColumns(pinnedNotes, 2), [pinnedNotes]);
  const otherCols = useMemo(() => splitIntoColumns(otherNotes, 2), [otherNotes]);

  const hasPinned = pinnedNotes.length > 0;

  const renderCard = useCallback(
    (note: Note) => (
      <NoteCard
        key={note.id}
        note={note}
        isDark={isDark}
        onPress={() => handleNotePress(note)}
      />
    ),
    [isDark, handleNotePress]
  );

  return (
    <View className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">
            {t("notesTitle")}
          </Text>
          <Pressable
            onPress={handleNew}
            className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-2"
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="text-sm font-medium text-primary-foreground">
              {t("notesNew")}
            </Text>
          </Pressable>
        </View>

        {/* Search */}
        <View className="flex-row items-center gap-2 rounded-full bg-muted px-4 py-2.5">
          <Search size={18} color={colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={(v) => {
              setSearchQuery(v);
              debouncedSearch(v);
            }}
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

        {/* Notes */}
        {notes.length === 0 ? (
          <View className="items-center gap-3 py-20">
            <FileText size={40} color={colors.mutedForeground} />
            <Text className="text-sm text-muted-foreground">
              {searchQuery ? t("notesNoResults") : t("notesEmpty")}
            </Text>
            {!searchQuery && (
              <Text className="text-xs text-muted-foreground">
                {t("notesEmptyHint")}
              </Text>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Pinned section */}
            {hasPinned && (
              <View className="mb-4">
                <Text className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("notesPinned")}
                </Text>
                <View className="flex-row gap-2">
                  {pinnedCols.map((col, i) => (
                    <View key={i} className="flex-1">
                      {col.map(renderCard)}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Others section */}
            <View>
              {hasPinned && (
                <Text className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("notesOthers")}
                </Text>
              )}
              {!hasPinned && (
                <Text className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("notesTitle")}
                </Text>
              )}
              <View className="flex-row gap-2">
                {otherCols.map((col, i) => (
                  <View key={i} className="flex-1">
                    {col.map(renderCard)}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
