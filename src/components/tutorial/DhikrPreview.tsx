import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { ChevronLeft, ChevronRight } from "../AppIcons";
import { DhikrCounterTitle } from "../DhikrCounterTitle";
import { useThemeColors } from "../../lib/theme";
import { useI18n } from "../../lib/i18n";
import { SAMPLE_DHIKR } from "../../lib/sampleDataset";

const COUNTER = 33;

export function DhikrPreview() {
  const colors = useThemeColors();
  const { t } = useI18n();
  const ripple = useSharedValue(1);

  useEffect(() => {
    ripple.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 150, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) })
      ),
      -1
    );
    return () => cancelAnimation(ripple);
  }, [ripple]);

  const numStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ripple.value }],
  }));

  return (
    <View className="items-center justify-center py-4">
      <View className="w-full flex-row items-center gap-4">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <ChevronLeft size={16} color={colors.mutedForeground} />
        </View>
        <DhikrCounterTitle name={SAMPLE_DHIKR.name} />
        <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
          <ChevronRight size={16} color={colors.mutedForeground} />
        </View>
      </View>
      <Animated.View style={numStyle} className="my-6">
        <Text
          style={{ fontSize: 72, fontWeight: "200", color: colors.foreground }}
          accessibilityLabel={t("dhikrCountLabel", { count: COUNTER })}
        >
          {COUNTER}
        </Text>
      </Animated.View>
    </View>
  );
}
