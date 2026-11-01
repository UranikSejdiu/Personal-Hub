import { Text } from "./ui/Typography";
import { View } from "react-native";
import { CircleCheck } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { formatCurrency } from "../lib/utils";

export function SavingsGoalCard({ goalAmount, balance }: { goalAmount: number; balance: number }) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const goalMet = goalAmount > 0 && balance >= goalAmount;
  const progress = goalAmount > 0 ? Math.max(0, Math.min(100, (balance / goalAmount) * 100)) : 0;
  return <View className="rounded-[24px] bg-secondary p-5">
    <Text className="mb-5 text-[28px] text-primary" accessible={false}>✳</Text>
    <Text className="text-xs text-muted-foreground">{t("savingsTotal")}</Text>
    <Text className={`mb-2 mt-1 text-[38px] font-semibold tracking-[-1.2px] ${balance < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(balance)}</Text>
    {goalAmount > 0 && <>
      <View className="mt-2 flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-xs text-muted-foreground">{t("dashboardSavingsTarget", { amount: formatCurrency(goalAmount) })}</Text>
        {goalMet && <View className="flex-row items-center gap-1"><CircleCheck size={12} color={colors.success} /><Text className="text-[11px] font-semibold text-success">{t("goalMetBadge")}</Text></View>}
      </View>
      <View className="mt-2 h-[7px] overflow-hidden rounded-full bg-secondary" accessible accessibilityRole="progressbar"
        accessibilityLabel={t("savingsGoalLabel")} accessibilityValue={{ min: 0, max: 100, now: progress }}>
        <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${progress}%` }} />
      </View>
    </>}
  </View>;
}
