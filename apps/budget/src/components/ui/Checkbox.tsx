import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Pressable, type PressableProps } from "react-native";
import { Check } from "../AppIcons";
import { cn } from "../../lib/utils";
import { useThemeColors } from "../../lib/theme";

type CheckboxProps = Omit<PressableProps, "accessibilityRole" | "accessibilityLabel" | "children" | "disabled"> & {
  checked: boolean;
  children?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
} & (
  | { displayOnly: true; accessibilityLabel?: string }
  | { displayOnly?: false; accessibilityLabel: string }
);

/** Shared checkbox control, with a compact display-only variant for previews. */
export function Checkbox({ checked, size = "md", displayOnly = false, children,
  className, disabled = false, accessibilityLabel, accessibilityState, ...props
}: CheckboxProps) {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  const previous = useRef(checked);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (previous.current === checked) return;
    previous.current = checked;
    scale.set(withSequence(
      withTiming(0.9, { duration: 65, reduceMotion: ReduceMotion.System }),
      withTiming(1.08, { duration: 90, reduceMotion: ReduceMotion.System }),
      withTiming(1, { duration: 80, reduceMotion: ReduceMotion.System })
    ));
  }, [checked, scale]);
  const indicator = (
    <Animated.View style={animatedStyle} className={cn(
      "shrink-0 items-center justify-center rounded-full border",
      size === "sm" ? "h-4 w-4" : "h-5 w-5",
      checked ? "border-primary bg-primary" : "border-muted-foreground/40 bg-background"
    )}>
      {checked && <Check size={size === "sm" ? 10 : 12} color={colors.primaryForeground} />}
    </Animated.View>
  );
  if (displayOnly) return indicator;
  return (
    <Pressable
      {...props}
      accessible
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, checked, disabled }}
      disabled={disabled}
      className={cn(
        "min-h-[44px] flex-row items-center gap-2 rounded-lg active:bg-muted active:opacity-70",
        !children && "h-11 w-11 justify-center",
        disabled && "opacity-50",
        className
      )}
    >
      {indicator}
      {children}
    </Pressable>
  );
}
