import { Pressable, View } from "react-native";
import { Check } from "./AppIcons";
import { PreferenceChoices } from "./PreferenceChoices";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import type { NotesPreferences } from "../lib/notesPreferences";

export function NotesDisplayOptions({ preferences, disabled, onChange }: {
  preferences: NotesPreferences; disabled: boolean; onChange: (patch: Partial<NotesPreferences>) => void;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  return (
        <View className="gap-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">{t("notesLayout")}</Text>
          <PreferenceChoices label={t("notesLayout")} value={preferences.viewMode}
            options={[{ value: "grid", label: t("notesViewGrid") }, { value: "list", label: t("notesViewList") }]}
            disabled={disabled} onChange={value => { onChange({ viewMode: value }); }} />
          <View className="mt-1 h-px bg-border/60" />
          <Text className="text-sm font-semibold text-foreground">Sort by</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={t("notesSort")} className="gap-1">
            {([
              { value: "updated", label: "notesSortUpdated", hint: "Recently edited first" },
              { value: "created", label: "notesSortCreated", hint: "Newest notes first" },
              { value: "title", label: "notesSortTitle", hint: "A to Z" },
            ] as const).map(option => {
              const selected = preferences.sort === option.value;
              return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={t(option.label)}
                accessibilityHint={option.hint} accessibilityState={{ checked: selected, disabled: disabled }}
                disabled={disabled} onPress={() => { onChange({ sort: option.value }); }}
                className={`min-h-[64px] flex-row items-center gap-3 rounded-[16px] px-3 py-3 active:bg-secondary disabled:opacity-50 ${selected ? "bg-primary/10" : ""}`}>
                <View className="min-w-0 flex-1 gap-1">
                  <Text className={`text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{t(option.label)}</Text>
                  <Text className="text-xs text-muted-foreground">{option.hint}</Text>
                </View>
                <View className={`h-6 w-6 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary" : "border-muted-foreground/50"}`}>
                  {selected && <Check size={12} color={colors.primaryForeground} />}
                </View>
              </Pressable>;
            })}
          </View>
        </View>
  );
}
