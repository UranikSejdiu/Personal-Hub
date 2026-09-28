import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Palette, Target, Cloud, Info } from "../AppIcons";
import { useThemeColors } from "../../lib/theme";
import { useI18n, type TKey } from "../../lib/i18n";
import { withAlpha } from "../../lib/utils";

export function SettingsPreview() {
  const colors = useThemeColors();
  const { t } = useI18n();
  const highlight = useSharedValue(0);

  useEffect(() => {
    highlight.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, [highlight]);

  const highlightBg = withAlpha(colors.primary, 0.08);
  const h1 = useAnimatedStyle(() => ({ backgroundColor: highlight.value > 0.5 ? highlightBg : "transparent" }));
  const h2 = useAnimatedStyle(() => ({ backgroundColor: highlight.value > 0.5 ? "transparent" : highlightBg }));

  const items: {
    icon: typeof Palette;
    labelKey: TKey;
    style: ReturnType<typeof useAnimatedStyle> | undefined;
  }[] = [
    { icon: Palette, labelKey: "settingsGeneral", style: h1 },
    { icon: Target, labelKey: "settingsBudget", style: h2 },
    { icon: Cloud, labelKey: "settingsBackupSync", style: undefined },
    { icon: Info, labelKey: "settingsAbout", style: undefined },
  ];

  return (
    <View className="mx-4 gap-2">
      {items.map((item, i) => (
        <Animated.View
          key={item.labelKey}
          style={item.style}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
        >
          <item.icon size={16} color={colors.foreground} />
          <Text className="text-sm font-medium text-foreground">{t(item.labelKey)}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
