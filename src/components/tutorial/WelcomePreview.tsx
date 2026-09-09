import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { Wallet, Sparkles, FileText } from "lucide-react-native";
import { useThemeColors } from "../../lib/theme";

export function WelcomePreview() {
  const colors = useThemeColors();
  const scale1 = useSharedValue(0.8);
  const scale2 = useSharedValue(0.8);
  const scale3 = useSharedValue(0.8);

  useEffect(() => {
    scale1.value = withDelay(0, withRepeat(withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
    scale2.value = withDelay(200, withRepeat(withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
    scale3.value = withDelay(400, withRepeat(withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);

  const style1 = useAnimatedStyle(() => ({ transform: [{ scale: scale1.value }] }));
  const style2 = useAnimatedStyle(() => ({ transform: [{ scale: scale2.value }] }));
  const style3 = useAnimatedStyle(() => ({ transform: [{ scale: scale3.value }] }));

  return (
    <View className="flex-row items-center justify-center gap-6 py-8">
      <Animated.View style={style1} className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Wallet size={28} color={colors.primary} />
      </Animated.View>
      <Animated.View style={style2} className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Sparkles size={28} color={colors.primary} />
      </Animated.View>
      <Animated.View style={style3} className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <FileText size={28} color={colors.primary} />
      </Animated.View>
    </View>
  );
}
