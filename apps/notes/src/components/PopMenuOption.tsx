import { useEffect, type ReactNode } from "react";
import { Pressable } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Text } from "./ui/Typography";

interface PopMenuOptionProps {
  label: string;
  hint?: string;
  icon: ReactNode;
  visible: boolean;
  distanceFromTrigger: number;
  onPress: () => void;
}

export function PopMenuOption({ label, hint, icon, visible, distanceFromTrigger, onPress }: PopMenuOptionProps) {
  const progress = useSharedValue(0);
  useEffect(() => {
    const transition = withTiming(visible ? 1 : 0, {
      duration: visible ? 200 : 140,
      reduceMotion: ReduceMotion.System,
    });
    progress.set(visible ? withDelay(distanceFromTrigger * 40, transition, ReduceMotion.System) : transition);
  }, [visible, distanceFromTrigger, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [
      { translateY: (1 - progress.get()) * 16 },
      { scale: 0.96 + progress.get() * 0.04 },
    ],
  }));

  return <Animated.View style={animatedStyle} className="max-w-full">
    <Pressable onPress={onPress} disabled={!visible}
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      className="min-h-[48px] max-w-full flex-row items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 active:opacity-70">
      {icon}
      <Text className="shrink text-label-large font-medium text-foreground">{label}</Text>
    </Pressable>
  </Animated.View>;
}
