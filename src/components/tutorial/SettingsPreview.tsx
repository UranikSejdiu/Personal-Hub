import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Palette, Target, Cloud, Info } from "lucide-react-native";
import { useThemeColors } from "../../lib/theme";

export function SettingsPreview() {
  const colors = useThemeColors();
  const highlight = useSharedValue(0);

  useEffect(() => {
    highlight.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, []);

  const h1 = useAnimatedStyle(() => ({ backgroundColor: `rgba(${highlight.value > 0.5 ? "59,130,246" : "0,0,0"}, ${highlight.value > 0.5 ? 0.08 : 0})` }));
  const h2 = useAnimatedStyle(() => ({ backgroundColor: `rgba(${highlight.value > 0.5 ? "0,0,0" : "59,130,246"}, ${highlight.value > 0.5 ? 0 : 0.08})` }));

  const items = [
    { icon: Palette, label: "General", style: h1 },
    { icon: Target, label: "Budget", style: h2 },
    { icon: Cloud, label: "Backup", style: undefined },
    { icon: Info, label: "About", style: undefined },
  ];

  return (
    <View className="mx-4 gap-2">
      {items.map((item, i) => (
        <Animated.View
          key={item.label}
          style={item.style}
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
        >
          <item.icon size={16} color={colors.foreground} />
          <Text className="text-sm font-medium text-foreground">{item.label}</Text>
        </Animated.View>
      ))}
    </View>
  );
}
