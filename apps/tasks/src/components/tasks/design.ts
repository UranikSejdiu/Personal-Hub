import { useTheme, useThemeColors } from "../../lib/theme";

export function useTaskDesign() {
  const { resolvedTheme } = useTheme();
  const colors = useThemeColors();
  return { ...colors, tiles: resolvedTheme === "dark"
    ? ["#363047", "#293b49", "#41332d", "#2b3b35"]
    : ["#ede8f8", "#e7f3fb", "#fcf0e7", "#e9f5ef"] };
}
