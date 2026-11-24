import { Text } from "./ui/Typography";
import { View } from "react-native";
import { CircleCheck } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import { formatCurrency } from "../lib/utils";

export function SavingsGoalCard({ goalAmount, balance, totalSaved, totalSpent }: {
  goalAmount: number;
  balance: number;
  totalSaved: number;
  totalSpent: number;
}) {
  const colors = useThemeColors();
  const goalMet = goalAmount > 0 && balance >= goalAmount;
  const progress = goalAmount > 0 ? Math.max(0, Math.min(100, (balance / goalAmount) * 100)) : 0;
  return <View className="gap-3 rounded-[28px] border border-border bg-surface-container p-5">
    <View>
      <Text className="text-label-medium text-muted-foreground">Total savings</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontVariant: ["tabular-nums"] }}
        className={`text-[34px] font-semibold ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
        {formatCurrency(balance)}
      </Text>
    </View>
    <View className="flex-row flex-wrap gap-3 border-t border-border pt-3">
      <View className="min-w-[104px] flex-1 gap-0.5">
        <Text className="text-label-medium text-muted-foreground">Total saved</Text>
        <Text className="text-base font-semibold text-foreground" style={{ fontVariant: ["tabular-nums"] }}>{formatCurrency(totalSaved)}</Text>
      </View>
      <View className="min-w-[104px] flex-1 gap-0.5">
        <Text className="text-label-medium text-muted-foreground">Total spent</Text>
        <Text className="text-base font-semibold text-foreground" style={{ fontVariant: ["tabular-nums"] }}>{formatCurrency(totalSpent)}</Text>
      </View>
    </View>
    {goalAmount > 0 && <>
      <View className="gap-1.5">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-label-medium text-muted-foreground">{`Savings target · ${formatCurrency(goalAmount)}`}</Text>
          {goalMet && <View className="flex-row items-center gap-1"><CircleCheck size={12} color={colors.success} /><Text className="text-label-medium font-semibold text-success">Target met</Text></View>}
        </View>
        <View className="h-1.5 overflow-hidden rounded-full bg-secondary-container" accessible accessibilityRole="progressbar"
          accessibilityLabel="Monthly Savings Target" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${progress}%` }} />
        </View>
      </View>
    </>}
  </View>;
}
