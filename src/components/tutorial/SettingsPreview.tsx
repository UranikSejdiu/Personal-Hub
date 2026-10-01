import { useState } from "react";
import { View, Text } from "react-native";
import { SettingsMenu, type SettingsSection } from "../SettingsMenu";
import { useI18n, type TKey } from "../../lib/i18n";

const HINTS: Record<SettingsSection, TKey> = {
  general: "tutorialSettingsGeneralHint",
  budget: "tutorialSettingsBudgetHint",
  backup: "tutorialSettingsBackupHint",
  about: "tutorialSettingsAboutHint",
};

export function SettingsPreview() {
  const { t } = useI18n();
  const [section, setSection] = useState<SettingsSection>("general");
  return (
    <View className="w-full gap-4">
      <SettingsMenu activeAppId="budget" onSelect={setSection} />
      <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-muted-foreground">{t(HINTS[section])}</Text>
    </View>
  );
}
