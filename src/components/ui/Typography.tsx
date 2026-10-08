import { forwardRef } from "react";
import { Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from "react-native";
import { cn } from "../../lib/utils";

// NativeWind drops universal CSS selectors on native platforms. Apply the
// regular family directly to each text surface; weight classes can override it.
export const Text = forwardRef<NativeText, TextProps>(function Text({ className, ...props }, ref) {
  return <NativeText {...props} ref={ref} className={cn("font-sans", className)} />;
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ className, ...props }, ref) {
  return <NativeTextInput {...props} ref={ref} className={cn("font-sans", className)} />;
});
