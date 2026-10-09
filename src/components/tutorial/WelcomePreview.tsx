import { useEffect } from "react";
import { View, Image } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
  useReducedMotion,
} from "react-native-reanimated";
import { Wallet, FileText, CheckSquare } from "../AppIcons";
import { useI18n } from "../../lib/i18n";
import { useThemeColors } from "../../lib/theme";

export function WelcomePreview() {
  const reduceMotion = useReducedMotion();
  const { t } = useI18n();
  const colors = useThemeColors();
  const scale1 = useSharedValue(0.8);
  const scale2 = useSharedValue(0.8);
  const scale3 = useSharedValue(0.8);

  useEffect(() => {
    if (reduceMotion) {
      scale1.value = 1;
      scale2.value = 1;
      scale3.value = 1;
      return;
    }
    scale1.value = withDelay(0, withRepeat(withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
    scale2.value = withDelay(200, withRepeat(withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
    scale3.value = withDelay(400, withRepeat(withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => {
      cancelAnimation(scale1);
      cancelAnimation(scale2);
      cancelAnimation(scale3);
    };
  }, [reduceMotion, scale1, scale2, scale3]);

  const style1 = useAnimatedStyle(() => ({ transform: [{ scale: scale1.value }] }));
  const style2 = useAnimatedStyle(() => ({ transform: [{ scale: scale2.value }] }));
  const style3 = useAnimatedStyle(() => ({ transform: [{ scale: scale3.value }] }));

  return (
    <View className="items-center gap-6 py-6">
      <Image source={require("../../../assets/icon-personal-hub.png")} className="h-24 w-24 rounded-3xl" accessibilityLabel={t("appName")} />
      <View className="flex-row flex-wrap items-center justify-center gap-4">
        <Animated.View style={style1} className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <Wallet size={28} color={colors.primary} />
        </Animated.View>
        <Animated.View style={style2} className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <FileText size={28} color={colors.primary} />
        </Animated.View>
        <Animated.View style={style3} className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <CheckSquare size={28} color={colors.primary} />
        </Animated.View>
      </View>
    </View>
  );
}
