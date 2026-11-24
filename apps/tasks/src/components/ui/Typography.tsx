import { forwardRef } from "react";
import { Platform, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps, type TextInstance, type TextInputInstance } from "react-native";
import { useThemeColors } from "../../lib/theme";
import { cn, withAlpha } from "../../lib/utils";

// NativeWind drops universal CSS selectors on native platforms. Apply the
// regular family directly to each text surface; weight classes can override it.
export const Text = forwardRef<TextInstance, TextProps>(function Text({ className, ...props }, ref) {
  return <NativeText {...props} ref={ref} className={cn("font-sans", className)} />;
});

export const TextInput = forwardRef<TextInputInstance, TextInputProps>(function TextInput({ className, ...props }, ref) {
  const colors = useThemeColors();
  return (
    <NativeTextInput
      cursorColor={colors.primary}
      selectionColor={Platform.OS === "ios" ? colors.primary : withAlpha(colors.primary, 0.24)}
      selectionHandleColor={colors.primary}
      {...props}
      ref={ref}
      className={cn("font-sans", className)}
    />
  );
});
