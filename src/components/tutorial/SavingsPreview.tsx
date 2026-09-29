import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useI18n } from "../../lib/i18n";
import { SAMPLE_SAVINGS } from "../../lib/sampleDataset";
import { formatCurrency } from "../../lib/utils";

const DEPOSIT = 200;
const PURCHASE = 50;

export function SavingsPreview() {
  const { t } = useI18n();
  const progress = useSharedValue(0);
  const itemSlide = useSharedValue(0);

  const goal = SAMPLE_SAVINGS.goal_amount;
  const saved = goal * 0.72;

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(0.72, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    itemSlide.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1, true
    );
  }, [progress, itemSlide]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const item1Style = useAnimatedStyle(() => ({ opacity: itemSlide.value, transform: [{ translateY: (1 - itemSlide.value) * 20 }] }));
  const item2Style = useAnimatedStyle(() => ({ opacity: itemSlide.value, transform: [{ translateY: (1 - itemSlide.value) * 30 }] }));

  return (
    <View className="mx-4 gap-3">
      <View className="rounded-xl border border-border bg-card p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-foreground">{t("savingsGoal")}</Text>
          <View className="rounded-full bg-success/15 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-success">72%</Text>
          </View>
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-xs text-muted-foreground">{t("savingsGoalOf", { amount: formatCurrency(goal) })}</Text>
          <Text className="text-xs font-medium text-success">{formatCurrency(saved)}</Text>
        </View>
        <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-border">
          <Animated.View style={barStyle} className="h-full rounded-full bg-success" />
        </View>
      </View>
      <Animated.View style={item1Style} className="flex-row items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-success" />
          <Text className="text-xs text-foreground">{t("savingsMonthlyDeposit")}</Text>
        </View>
        <Text className="text-xs font-medium text-success">
          +{formatCurrency(DEPOSIT)}
        </Text>
      </Animated.View>
      <Animated.View style={item2Style} className="flex-row items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-destructive" />
          <Text className="text-xs text-foreground">{t("savingsPurchase")}</Text>
        </View>
        <Text className="text-xs font-medium text-destructive">
          -{formatCurrency(PURCHASE)}
        </Text>
      </Animated.View>
    </View>
  );
}
