import { Text } from "./ui/Typography";
import { View } from "react-native";
import { NumberInput } from "./NumberInput";
import { useI18n } from "../lib/i18n";

interface Props {
  income: number;
  goal: number;
  saving?: boolean;
  preview?: boolean;
  onIncomeChange: (value: number) => void;
  onGoalChange: (value: number) => void;
}

/** Shared by Settings and its tutorial; preview callbacks only change local state. */
export function BudgetSettingsFields({ income, goal, saving = false, preview = false, onIncomeChange, onGoalChange }: Props) {
  const { t } = useI18n();
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3">
      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">{t("monthlyIncome")}</Text>
        <NumberInput value={income} onChange={onIncomeChange} min={0} max={Number.MAX_SAFE_INTEGER / 100} decimals={2} placeholder="0.00" accessibilityLabel={t("monthlyIncome")} />
        <Text className="text-sm leading-5 text-muted-foreground">{t("settingsIncomeHelp")}</Text>
      </View>
      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">{t("savingsGoalLabel")}</Text>
        <NumberInput value={goal} onChange={onGoalChange} min={0} max={Number.MAX_SAFE_INTEGER / 100} decimals={2} placeholder="0.00" accessibilityLabel={t("savingsGoalLabel")} />
        <Text className="text-sm leading-5 text-muted-foreground">{t("settingsSavingsHelp")}</Text>
      </View>
      <Text accessibilityLiveRegion="polite" className="text-xs leading-5 text-muted-foreground">{t(preview ? "tutorialSampleOnly" : saving ? "savingAuto" : "settingsAutoSaveHelp")}</Text>
    </View>
  );
}
