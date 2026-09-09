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

export function DashboardPreview() {
  const colors = useThemeColors();
  const progress = useSharedValue(0);
  const expandHeight = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(0.65, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    expandHeight.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: expandHeight.value,
    height: expandHeight.value * 64,
  }));

  return (
    <View className="mx-4 overflow-hidden rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold text-foreground">September 2026</Text>
        <Text className="text-xs text-destructive">-€120</Text>
      </View>
      <Animated.View style={contentStyle} className="mt-2 gap-1 overflow-hidden">
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted-foreground">Income:</Text>
          <Text className="text-xs font-medium text-foreground">€2,500</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted-foreground">Planned:</Text>
          <Text className="text-xs font-medium text-foreground">€2,380</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted-foreground">Remaining:</Text>
          <Text className="text-xs font-medium text-foreground">€120</Text>
        </View>
      </Animated.View>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-border">
        <Animated.View style={barStyle} className="h-full rounded-full bg-primary" />
      </View>
    </View>
  );
}
