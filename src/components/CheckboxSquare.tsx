import { View } from "react-native";
import { Check } from "./AppIcons";
import { cn } from "../lib/utils";
import { useThemeColors } from "../lib/theme";

/**
 * A flat, Google Keep-style checkbox square. Shared by the checklist editor
 * and the note card preview so both render tick state identically.
 */
export function CheckboxSquare({
  checked,
  size = "md",
}: {
  checked: boolean;
  size?: "sm" | "md";
}) {
  const colors = useThemeColors();
  return (
    <View
      className={cn(
        "items-center justify-center rounded border-2",
        size === "sm" ? "h-4 w-4" : "h-5 w-5",
        checked ? "border-primary bg-primary" : "border-muted-foreground"
      )}
    >
      {checked ? (
        <Check size={size === "sm" ? 11 : 14} color={colors.primaryForeground} />
      ) : null}
    </View>
  );
}
