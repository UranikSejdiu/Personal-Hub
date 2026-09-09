import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

export function LoansPreview() {
  const progress = useSharedValue(0);
  const tableSlide = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(0.45, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    tableSlide.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) }),
      -1, true
    );
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const row1 = useAnimatedStyle(() => ({ opacity: tableSlide.value }));
  const row2 = useAnimatedStyle(() => ({ opacity: tableSlide.value, transform: [{ translateY: (1 - tableSlide.value) * 10 }] }));
  const row3 = useAnimatedStyle(() => ({ opacity: tableSlide.value, transform: [{ translateY: (1 - tableSlide.value) * 20 }] }));

  return (
    <View className="mx-4 gap-3">
      <View className="rounded-xl border border-border bg-card p-4">
        <View className="flex-row items-center gap-2">
          <View className="h-5 w-5 items-center justify-center rounded bg-primary/15">
            <Text className="text-[10px] font-bold text-primary">€</Text>
          </View>
          <Text className="text-sm font-medium text-foreground">Home Loan</Text>
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-xs text-muted-foreground">Monthly: €450</Text>
          <Text className="text-xs text-muted-foreground">36/120 months</Text>
        </View>
        <View className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <Animated.View style={barStyle} className="h-full rounded-full bg-primary" />
        </View>
      </View>
      <View className="overflow-hidden rounded-xl border border-border bg-card p-3">
        <Text className="mb-2 text-[10px] font-semibold text-muted-foreground">AMORTIZATION</Text>
        <Animated.View style={row1} className="flex-row justify-between border-b border-border py-1">
          <Text className="text-[10px] text-muted-foreground">#1</Text>
          <Text className="text-[10px] text-foreground">€450</Text>
          <Text className="text-[10px] text-foreground">€312</Text>
          <Text className="text-[10px] text-muted-foreground">€138</Text>
        </Animated.View>
        <Animated.View style={row2} className="flex-row justify-between border-b border-border py-1">
          <Text className="text-[10px] text-muted-foreground">#2</Text>
          <Text className="text-[10px] text-foreground">€450</Text>
          <Text className="text-[10px] text-foreground">€315</Text>
          <Text className="text-[10px] text-muted-foreground">€135</Text>
        </Animated.View>
        <Animated.View style={row3} className="flex-row justify-between py-1">
          <Text className="text-[10px] text-muted-foreground">#3</Text>
          <Text className="text-[10px] text-foreground">€450</Text>
          <Text className="text-[10px] text-foreground">€318</Text>
          <Text className="text-[10px] text-muted-foreground">€132</Text>
        </Animated.View>
      </View>
    </View>
  );
}
