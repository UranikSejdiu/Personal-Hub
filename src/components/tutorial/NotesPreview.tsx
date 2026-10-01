import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Search } from "../AppIcons";
import { NoteCard } from "../NoteCard";
import { useI18n } from "../../lib/i18n";
import { sampleNote, SAMPLE_NOTES } from "../../lib/sampleDataset";
import { useThemeColors } from "../../lib/theme";
import { contentToMarkdown } from "../../lib/noteContent";

/**
 * Renders the real note cards from the sample dataset, so the preview lines,
 * pin badge and checkbox strike-through match the notes list exactly.
 */
export function NotesPreview() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [query, setQuery] = useState("");

  const now = new Date().toISOString();
  const notes = SAMPLE_NOTES.map((_, index) => sampleNote(index, now, now));
  const term = query.trim().toLowerCase();
  const visible = term
    ? notes.filter((note) => [note.title, contentToMarkdown(note.content), ...(note.items ?? []).map((item) => item.text)].join("\n").toLowerCase().includes(term))
    : notes;

  return (
    <View className="w-full gap-3 px-1">
      <View className="min-h-[44px] flex-row items-center gap-2 rounded-full bg-muted px-3 py-1">
        <Search size={18} color={colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("notesSearchPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          className="min-w-0 flex-1 text-sm text-foreground"
          accessibilityLabel={t("notesSearchPlaceholder")}
        />
      </View>
      {visible.length > 0 ? (
        visible.map((note) => (
          <NoteCard key={note.id} note={note} onPress={() => {}} untitledLabel={t("notesUntitled")} />
        ))
      ) : (
        <Text className="py-6 text-center text-sm text-muted-foreground">
          {t("notesNoResults")}
        </Text>
      )}
    </View>
  );
}
