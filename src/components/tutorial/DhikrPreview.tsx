import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useThemeColors } from "../../lib/theme";

export function DhikrPreview() {
  const colors = useThemeColors();
  const count = useSharedValue(0);
  const ripple = useSharedValue(1);

  useEffect(() => {
    count.value = withRepeat(
      withTiming(33, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    ripple.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 150, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) })
      ),
      -1
    );
  }, []);

  const numStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ripple.value }],
  }));

  return (
    <View className="items-center justify-center py-4">
      <View className="flex-row items-center gap-4">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Text className="text-lg text-muted-foreground">‹</Text>
        </View>
        <Text className="text-base font-semibold text-foreground">Istighfar</Text>
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <Text className="text-lg text-muted-foreground">›</Text>
        </View>
      </View>
      <Animated.View style={numStyle} className="my-6">
        <Text style={{ fontSize: 72, fontWeight: "200", color: colors.foreground }}>33</Text>
      </Animated.View>
      <View className="flex-row items-center gap-3">
        <View className="rounded-full bg-success/15 px-3 py-1">
          <Text className="text-xs font-semibold text-success">Goal Complete</Text>
        </View>
      </View>
    </View>
  );
}
