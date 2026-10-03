import type { ComponentType } from "react";
import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";
import type { AppIconProps } from "../AppIcons";
import { useThemeColors } from "../../lib/theme";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "destructive";

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  icon?: ComponentType<AppIconProps>;
  variant?: ButtonVariant;
  busy?: boolean;
}

const BACKGROUNDS: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  destructive: "bg-destructive",
};

const LABELS: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  destructive: "text-destructive-foreground",
};

export function Button({
  label,
  icon: Icon,
  variant = "primary",
  busy = false,
  disabled = false,
  className,
  accessibilityLabel = label,
  accessibilityState,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const foreground = variant === "primary"
    ? colors.primaryForeground
    : variant === "destructive"
      ? colors.destructiveForeground
      : colors.secondaryForeground;

  return (
    <Pressable
      {...props}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      className={cn(
        "min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 active:opacity-70",
        BACKGROUNDS[variant],
        (disabled || busy) && "opacity-60",
        className
      )}
    >
      {busy ? <ActivityIndicator size="small" color={foreground} /> : Icon ? <Icon size={18} color={foreground} /> : null}
      <Text className={cn("shrink text-center text-sm font-semibold", LABELS[variant])}>{label}</Text>
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
      accessibilityState={{ ...accessibilityState, disabled: disabled ?? false }}
      disabled={disabled ?? false}
      className={cn(
        "h-11 w-11 items-center justify-center rounded-xl active:bg-muted",
        selected && "bg-primary/10",
        disabled && "opacity-60",
        className
      )}
    >
      <Icon size={20} color={selected ? colors.primary : colors.mutedForeground} />
    </Pressable>
  );
}
