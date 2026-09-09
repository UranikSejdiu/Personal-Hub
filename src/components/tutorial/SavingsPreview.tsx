import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useThemeColors } from "../../lib/theme";

export function SavingsPreview() {
  const colors = useThemeColors();
  const progress = useSharedValue(0);
  const itemSlide = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(0.72, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    itemSlide.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }),
      -1, true
    );
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const item1Style = useAnimatedStyle(() => ({ opacity: itemSlide.value, transform: [{ translateY: (1 - itemSlide.value) * 20 }] }));
  const item2Style = useAnimatedStyle(() => ({ opacity: itemSlide.value, transform: [{ translateY: (1 - itemSlide.value) * 30 }] }));

  return (
    <View className="mx-4 gap-3">
      <View className="rounded-xl border border-border bg-card p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-foreground">Savings Goal</Text>
          <View className="rounded-full bg-success/15 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-success">72%</Text>
          </View>
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-xs text-muted-foreground">Goal: €5,000</Text>
          <Text className="text-xs font-medium text-success">€3,600</Text>
        </View>
        <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-border">
          <Animated.View style={barStyle} className="h-full rounded-full bg-success" />
        </View>
      </View>
      <Animated.View style={item1Style} className="flex-row items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-success" />
          <Text className="text-xs text-foreground">Monthly deposit</Text>
        </View>
        <Text className="text-xs font-medium text-success">+€200</Text>
      </Animated.View>
      <Animated.View style={item2Style} className="flex-row items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-destructive" />
          <Text className="text-xs text-foreground">Purchase</Text>
        </View>
        <Text className="text-xs font-medium text-destructive">-€50</Text>
      </Animated.View>
    </View>
  );
}
