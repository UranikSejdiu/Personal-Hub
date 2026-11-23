import { Text } from "./ui/Typography";
import { View } from "react-native";
import { CircleCheck } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import { formatCurrency } from "../lib/utils";

export function SavingsGoalCard({ goalAmount, balance }: { goalAmount: number; balance: number }) {
  const colors = useThemeColors();
  const goalMet = goalAmount > 0 && balance >= goalAmount;
  const progress = goalAmount > 0 ? Math.max(0, Math.min(100, (balance / goalAmount) * 100)) : 0;
  return <View className="rounded-2xl bg-surface-container p-3">
    <Text className="text-xs text-muted-foreground">Total savings</Text>
    <Text className={`text-[26px] font-semibold ${balance < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(balance)}</Text>
    {goalAmount > 0 && <>
      <View className="mt-2 flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-xs text-muted-foreground">{`Savings target · ${formatCurrency(goalAmount)}`}</Text>
        {goalMet && <View className="flex-row items-center gap-1"><CircleCheck size={12} color={colors.success} /><Text className="text-[11px] font-semibold text-success">Target met</Text></View>}
      </View>
      <View className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary" accessible accessibilityRole="progressbar"
        accessibilityLabel="Monthly Savings Target" accessibilityValue={{ min: 0, max: 100, now: progress }}>
        <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${progress}%` }} />
      </View>
    </>}
  </View>;
}
