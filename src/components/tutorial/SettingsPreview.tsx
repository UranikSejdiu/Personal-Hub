import { useState } from "react";
import { View, Text } from "react-native";
import { BudgetSettingsFields } from "../BudgetSettingsFields";
import { Button } from "../ui/Button";
import { SettingsMenu, type SettingsSection } from "../SettingsMenu";
import { useI18n, type TKey } from "../../lib/i18n";
import { SAMPLE_SAVINGS } from "../../lib/sampleDataset";
import { formatCurrency } from "../../lib/utils";
import type { AccentName, ThemeName } from "../../constants/theme";

type PreviewSection = SettingsSection | "appearance" | "preferences" | "tutorial";

const HINTS: Record<PreviewSection, TKey> = {
  appearance: "tutorialSettingsGeneralHint",
  preferences: "tutorialSettingsGeneralHint",
  tutorial: "tutorialSettingsGeneralHint",
  budget: "tutorialSettingsBudgetHint",
  backup: "tutorialSettingsBackupHint",
  about: "tutorialSettingsAboutHint",
};

export function SettingsPreview() {
  const { t } = useI18n();
  const [section, setSection] = useState<PreviewSection>("appearance");
  const [theme, setTheme] = useState<ThemeName>("light");
  const [accent, setAccent] = useState<AccentName>("blue");
  const [income, setIncome] = useState(SAMPLE_SAVINGS.salary);
  const [goal, setGoal] = useState(SAMPLE_SAVINGS.goal_amount);
  const [hapticsOn, setHapticsOn] = useState(true);
  return (
    <View className="w-full gap-4">
      {section === "budget" ? (
        <View className="gap-3">
          <Button label={t("settingsBack")} variant="secondary" onPress={() => setSection("appearance")} />
          <BudgetSettingsFields preview income={income} goal={goal} onIncomeChange={setIncome} onGoalChange={setGoal} />
        </View>
      ) : <SettingsMenu
        theme={theme}
        accent={accent}
        hapticsOn={hapticsOn}
        budgetSummary={t("settingsBudgetSummary", { salary: formatCurrency(income), target: formatCurrency(goal) })}
        onThemeChange={(next) => { setTheme(next); setSection("appearance"); }}
        onAccentChange={(next) => { setAccent(next); setSection("appearance"); }}
        onHapticsChange={(next) => { setHapticsOn(next); setSection("preferences"); }}
        onSelect={setSection}
        onReplayTutorial={() => setSection("tutorial")}
      />}
      <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-muted-foreground">{t(HINTS[section])}</Text>
    </View>
  );
}
