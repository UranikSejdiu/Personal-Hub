import { useState } from "react";
import { View, Text } from "react-native";
import { BudgetSettingsFields } from "../BudgetSettingsFields";
import { Button } from "../ui/Button";
import { SettingsMenu, type SettingsSection } from "../SettingsMenu";
import { useI18n, type TKey } from "../../lib/i18n";
import { SAMPLE_SAVINGS } from "../../lib/sampleDataset";
import { formatCurrency } from "../../lib/utils";
import { useTheme } from "../../lib/theme";
import { HUB_APPS } from "../../hub/registry";
import { toggleEnabledModule } from "../../hub/ModulePreferences";
import { ModuleChooser } from "../ModuleChooser";

type PreviewSection = SettingsSection | "appearance" | "preferences" | "tutorial";

const HINTS: Record<PreviewSection, TKey> = {
  appearance: "tutorialSettingsGeneralHint",
  preferences: "tutorialSettingsGeneralHint",
  tutorial: "tutorialSettingsGeneralHint",
  budget: "tutorialSettingsBudgetHint",
  modules: "tutorialSettingsModulesHint",
  backup: "tutorialSettingsBackupHint",
  about: "tutorialSettingsAboutHint",
};

export function SettingsPreview() {
  const { t } = useI18n();
  const [section, setSection] = useState<PreviewSection>("appearance");
  const { theme, setTheme } = useTheme();
  const [income, setIncome] = useState(SAMPLE_SAVINGS.salary);
  const [goal, setGoal] = useState(SAMPLE_SAVINGS.goal_amount);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [enabledIds, setEnabledIds] = useState(HUB_APPS.map((app) => app.id));
  return (
    <View className="w-full gap-4">
      {section === "budget" ? (
        <View className="gap-3">
          <Button label={t("settingsBack")} variant="secondary" onPress={() => setSection("appearance")} />
          <BudgetSettingsFields preview income={income} goal={goal} onIncomeChange={setIncome} onGoalChange={setGoal} />
        </View>
      ) : section === "modules" ? (
        <View className="gap-3">
          <Button label={t("settingsBack")} variant="secondary" onPress={() => setSection("appearance")} />
          <Text className="text-sm leading-6 text-muted-foreground">{t("settingsModulesHelp")}</Text>
          <ModuleChooser enabledIds={enabledIds} onToggle={(id) => setEnabledIds((current) => toggleEnabledModule(current, id))} />
        </View>
      ) : <SettingsMenu
        theme={theme}
        hapticsOn={hapticsOn}
        budgetSummary={t("settingsBudgetSummary", { salary: formatCurrency(income), target: formatCurrency(goal) })}
        enabledIds={enabledIds}
        onThemeChange={(next) => { setTheme(next); setSection("appearance"); }}
        onHapticsChange={(next) => { setHapticsOn(next); setSection("preferences"); }}
        onSelect={setSection}
        onReplayTutorial={() => setSection("tutorial")}
      />}
      <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-muted-foreground">{t(HINTS[section])}</Text>
    </View>
  );
}
