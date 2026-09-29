import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Search } from "../AppIcons";
import { NoteCard } from "../NoteCard";
import { useI18n } from "../../lib/i18n";
import { sampleNote, SAMPLE_NOTES } from "../../lib/sampleDataset";

/**
 * Renders the real note cards from the sample dataset, so the preview lines,
 * pin badge and checkbox strike-through match the notes list exactly.
 */
export function NotesPreview() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const now = new Date().toISOString();
  const notes = SAMPLE_NOTES.map((_, index) => sampleNote(index, now, now));
  const term = query.trim().toLowerCase();
  const visible = term
    ? notes.filter((note) => note.title.toLowerCase().includes(term))
    : notes;

  return (
    <View className="w-full gap-3 px-1">
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search size={14} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("notesSearchPlaceholder")}
          placeholderTextColor="currentColor"
          className="flex-1 text-xs text-muted-foreground"
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
