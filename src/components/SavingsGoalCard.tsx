import { View, Text } from "react-native";
import { CircleCheck } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { formatCurrency } from "../lib/utils";

export function SavingsGoalCard({ goalAmount, balance }: { goalAmount: number; balance: number }) {
  const { t } = useI18n();
  const colors = useThemeColors();
  if (goalAmount <= 0) return null;
  const goalMet = balance >= goalAmount;
  const progress = Math.max(0, Math.min(100, (balance / goalAmount) * 100));
  return (
    <View className="rounded-xl border border-border bg-card p-3">
      <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-base font-semibold text-foreground">{t("savingsGoalLabel")}</Text>
        {goalMet && (
          <View className="flex-row items-center gap-1 rounded-full bg-success/15 px-2 py-0.5">
            <CircleCheck size={12} color={colors.success} />
            <Text className="text-[11px] font-semibold text-success">{t("goalMetBadge")}</Text>
          </View>
        )}
      </View>
      <View className="flex-row flex-wrap justify-between gap-2">
        <Text className="text-sm text-muted-foreground">{t("goalColon")}</Text>
        <Text className="text-sm font-medium text-foreground">{formatCurrency(goalAmount)}</Text>
      </View>
      <View className="flex-row flex-wrap justify-between gap-2">
        <Text className="text-sm text-muted-foreground">{t("savedLabel")}</Text>
        <Text className={`text-sm font-medium ${goalMet ? "text-success" : "text-foreground"}`}>{formatCurrency(balance)}</Text>
      </View>
      <View
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t("savingsGoalLabel")}
        accessibilityValue={{ min: 0, max: 100, now: progress }}
      >
        <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${progress}%` }} />
      </View>
    </View>
  );
}
