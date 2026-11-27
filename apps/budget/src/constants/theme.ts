export type ThemeName = "light" | "dark";

/** Shared by NativeWind variables, icons, inputs, and native controls. */
export const COLORS = {
  light: {
    deposit: "hsl(170, 72%, 23%)",
    depositContainer: "hsl(163, 52%, 91%)",
    withdraw: "hsl(30, 88%, 27%)",
    withdrawContainer: "hsl(39, 92%, 91%)",
    surfaceContainer: "hsl(0, 0%, 96%)",
    surfaceContainerHigh: "hsl(0, 0%, 93%)",
    primaryContainer: "hsl(0, 0%, 90%)",
    onPrimaryContainer: "hsl(0, 0%, 0%)",
    secondaryContainer: "hsl(0, 0%, 91%)",
    onSecondaryContainer: "hsl(0, 0%, 0%)",
    outline: "hsl(0, 0%, 42%)",
    background: "hsl(0, 0%, 100%)",
    foreground: "hsl(0, 0%, 0%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(0, 0%, 0%)",
    secondary: "hsl(0, 0%, 95%)",
    secondaryForeground: "hsl(0, 0%, 0%)",
    muted: "hsl(0, 0%, 95%)",
    mutedForeground: "hsl(0, 0%, 34%)",
    accent: "hsl(0, 0%, 95%)",
    accentForeground: "hsl(0, 0%, 0%)",
    destructive: "hsl(0, 0%, 23%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(0, 0%, 31%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(0, 0%, 98%)",
    border: "hsl(0, 0%, 86%)",
    input: "hsl(0, 0%, 61%)",
    chart1: "hsl(0, 0%, 24%)",
    chart2: "hsl(0, 0%, 29%)",
    chart3: "hsl(0, 0%, 34%)",
    chart4: "hsl(0, 0%, 39%)",
    chart5: "hsl(0, 0%, 43%)",
    primary: "hsl(0, 0%, 0%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  dark: {
    deposit: "hsl(166, 62%, 75%)",
    depositContainer: "hsl(170, 48%, 15%)",
    withdraw: "hsl(39, 88%, 75%)",
    withdrawContainer: "hsl(30, 48%, 17%)",
    surfaceContainer: "hsl(0, 0%, 11%)",
    surfaceContainerHigh: "hsl(0, 0%, 15%)",
    primaryContainer: "hsl(0, 0%, 19%)",
    onPrimaryContainer: "hsl(0, 0%, 100%)",
    secondaryContainer: "hsl(0, 0%, 17%)",
    onSecondaryContainer: "hsl(0, 0%, 100%)",
    outline: "hsl(0, 0%, 63%)",
    background: "hsl(0, 0%, 0%)",
    foreground: "hsl(0, 0%, 100%)",
    card: "hsl(0, 0%, 6%)",
    cardForeground: "hsl(0, 0%, 100%)",
    secondary: "hsl(0, 0%, 12%)",
    secondaryForeground: "hsl(0, 0%, 100%)",
    muted: "hsl(0, 0%, 12%)",
    mutedForeground: "hsl(0, 0%, 67%)",
    accent: "hsl(0, 0%, 12%)",
    accentForeground: "hsl(0, 0%, 100%)",
    destructive: "hsl(0, 0%, 75%)",
    destructiveForeground: "hsl(0, 0%, 0%)",
    success: "hsl(0, 0%, 81%)",
    successForeground: "hsl(0, 0%, 0%)",
    surface: "hsl(0, 0%, 9%)",
    border: "hsl(0, 0%, 22%)",
    input: "hsl(0, 0%, 45%)",
    chart1: "hsl(0, 0%, 86%)",
    chart2: "hsl(0, 0%, 79%)",
    chart3: "hsl(0, 0%, 72%)",
    chart4: "hsl(0, 0%, 65%)",
    chart5: "hsl(0, 0%, 58%)",
    primary: "hsl(0, 0%, 100%)",
    primaryForeground: "hsl(0, 0%, 0%)",
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

export const NOTE_COLORS = {
  default: { light: "bg-card", dark: "bg-card" },
  yellow: { light: "bg-yellow-100", dark: "bg-yellow-900/30" },
  green: { light: "bg-green-100", dark: "bg-green-900/30" },
  blue: { light: "bg-blue-100", dark: "bg-blue-900/30" },
  pink: { light: "bg-pink-100", dark: "bg-pink-900/30" },
  purple: { light: "bg-purple-100", dark: "bg-purple-900/30" },
  orange: { light: "bg-orange-100", dark: "bg-orange-900/30" },
  red: { light: "bg-red-100", dark: "bg-red-900/30" },
} as const;

export type NoteColor = keyof typeof NOTE_COLORS;
