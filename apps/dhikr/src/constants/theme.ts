export type ThemeName = "light" | "dark";

/** Shared by NativeWind variables, icons, inputs, and native controls. */
export const COLORS = {
  light: {
    background: "hsl(150, 25%, 97%)",
    foreground: "hsl(160, 30%, 13%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(160, 30%, 13%)",
    secondary: "hsl(150, 24%, 93%)",
    secondaryForeground: "hsl(160, 30%, 13%)",
    muted: "hsl(150, 24%, 93%)",
    mutedForeground: "hsl(160, 18%, 36%)",
    accent: "hsl(150, 24%, 93%)",
    accentForeground: "hsl(160, 30%, 13%)",
    destructive: "hsl(0, 72%, 43%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(155, 65%, 27%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(150, 22%, 95%)",
    border: "hsl(150, 18%, 81%)",
    input: "hsl(150, 15%, 70%)",
    chart1: "hsl(12, 76%, 38%)",
    chart2: "hsl(173, 65%, 29%)",
    chart3: "hsl(145, 45%, 28%)",
    chart4: "hsl(43, 80%, 28%)",
    chart5: "hsl(160, 30%, 33%)",
    primary: "hsl(160, 60%, 26%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  dark: {
    background: "hsl(160, 24%, 8%)",
    foreground: "hsl(150, 30%, 95%)",
    card: "hsl(160, 20%, 12%)",
    cardForeground: "hsl(150, 30%, 95%)",
    secondary: "hsl(160, 18%, 18%)",
    secondaryForeground: "hsl(150, 30%, 95%)",
    muted: "hsl(160, 18%, 18%)",
    mutedForeground: "hsl(150, 18%, 72%)",
    accent: "hsl(160, 18%, 18%)",
    accentForeground: "hsl(150, 30%, 95%)",
    destructive: "hsl(8, 85%, 74%)",
    destructiveForeground: "hsl(160, 30%, 10%)",
    success: "hsl(150, 58%, 66%)",
    successForeground: "hsl(160, 30%, 10%)",
    surface: "hsl(160, 18%, 18%)",
    border: "hsl(160, 16%, 28%)",
    input: "hsl(160, 16%, 40%)",
    chart1: "hsl(12, 76%, 72%)",
    chart2: "hsl(173, 58%, 65%)",
    chart3: "hsl(160, 45%, 70%)",
    chart4: "hsl(43, 74%, 70%)",
    chart5: "hsl(150, 30%, 72%)",
    primary: "hsl(157, 55%, 68%)",
    primaryForeground: "hsl(160, 30%, 10%)",
  },
} as const;

export function getThemeColors(theme: ThemeName) {
  return { ...COLORS[theme], ring: COLORS[theme].primary };
}

export type ThemeColors = ReturnType<typeof getThemeColors>;

/** Tailwind's hsl(var(--token)) values, derived from the same native colors. */
export function getThemeVariables(colors: ThemeColors): Record<string, string> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      `--${key.replace(/([A-Z]|\d)/g, "-$1").toLowerCase()}`,
      value.slice(4, -1).replace(/,\s*/g, " "),
    ])
  );
}

