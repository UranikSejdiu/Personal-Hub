import type { ComponentType } from "react";
import { ActivityIndicator, Pressable, type PressableProps } from "react-native";
import type { AppIconProps } from "../AppIcons";
import type { ThemeColors } from "../../constants/theme";
import { useThemeColors } from "../../lib/theme";
import { cn } from "../../lib/utils";
import { Text } from "./Typography";

const VARIANTS = {
  primary: { container: "bg-primary", label: "text-primary-foreground", color: "primaryForeground" },
  secondary: { container: "border border-outline", label: "text-primary", color: "primary" },
  tonal: { container: "bg-secondary-container", label: "text-on-secondary-container", color: "onSecondaryContainer" },
  text: { container: "", label: "text-primary", color: "primary" },
  destructive: { container: "bg-destructive", label: "text-destructive-foreground", color: "destructiveForeground" },
} as const satisfies Record<string, { container: string; label: string; color: keyof ThemeColors }>;

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  icon?: ComponentType<AppIconProps>;
  variant?: keyof typeof VARIANTS;
  busy?: boolean;
}

export function Button({
  label,
  icon: Icon,
  variant = "primary",
  busy = false,
  disabled = false,
  className,
  accessibilityLabel = label,
  accessibilityRole = "button",
  accessibilityState,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const appearance = VARIANTS[variant];
  const foreground = colors[appearance.color];

  return (
    <Pressable
      {...props}
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      className={cn(
        "min-h-[48px] flex-row items-center justify-center gap-2 rounded-full px-3.5 py-2 active:opacity-70",
        appearance.container,
        (disabled || busy) && "opacity-60",
        className
      )}
    >
      {busy ? <ActivityIndicator size="small" color={foreground} /> : Icon ? <Icon size={16} color={foreground} /> : null}
      <Text className={cn("shrink text-center text-label-large font-medium", appearance.label)}>{label}</Text>
    </Pressable>
  );
}

interface IconButtonProps extends Omit<PressableProps, "children" | "accessibilityLabel"> {
  icon: ComponentType<AppIconProps>;
  accessibilityLabel: string;
  selected?: boolean;
}

export function IconButton({
  icon: Icon,
  selected = false,
  disabled = false,
  className,
  accessibilityLabel,
  accessibilityState,
  ...props
}: IconButtonProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      {...props}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled, selected: accessibilityState?.selected ?? (selected || undefined) }}
      disabled={disabled}
      className={cn(
        "h-12 w-12 items-center justify-center rounded-full active:opacity-65",
        selected ? "bg-secondary-container" : "active:bg-surface-container-high",
        disabled && "opacity-60",
        className
      )}
    >
      <Icon size={20} color={selected ? colors.onSecondaryContainer : colors.foreground} />
    </Pressable>
  );
}
