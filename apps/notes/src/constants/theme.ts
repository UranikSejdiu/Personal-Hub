export type ThemeName = "light" | "dark";

/** Neutral gray surfaces and graphite accents across both themes. */
export const COLORS = {
  light: {
    background: "hsl(0, 0%, 98%)",
    foreground: "hsl(0, 0%, 13%)",
    card: "hsl(0, 0%, 94%)",
    cardForeground: "hsl(0, 0%, 13%)",
    secondary: "hsl(0, 0%, 90%)",
    secondaryForeground: "hsl(0, 0%, 13%)",
    muted: "hsl(0, 0%, 90%)",
    mutedForeground: "hsl(0, 0%, 36%)",
    accent: "hsl(0, 0%, 90%)",
    accentForeground: "hsl(0, 0%, 13%)",
    destructive: "hsl(0, 72%, 43%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 65%, 26%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(0, 0%, 96%)",
    border: "hsl(0, 0%, 81%)",
    input: "hsl(0, 0%, 52%)",
    chart1: "hsl(12, 76%, 38%)",
    chart2: "hsl(173, 65%, 27%)",
    chart3: "hsl(197, 55%, 30%)",
    chart4: "hsl(43, 80%, 28%)",
    chart5: "hsl(262, 65%, 45%)",
    primary: "hsl(0, 0%, 24%)",
    primaryForeground: "hsl(0, 0%, 100%)",
    action: "hsl(0, 0%, 18%)",
    actionForeground: "hsl(0, 0%, 100%)",
  },
  dark: {
    background: "hsl(0, 0%, 9%)",
    foreground: "hsl(0, 0%, 95%)",
    card: "hsl(0, 0%, 14%)",
    cardForeground: "hsl(0, 0%, 95%)",
    secondary: "hsl(0, 0%, 20%)",
    secondaryForeground: "hsl(0, 0%, 95%)",
    muted: "hsl(0, 0%, 20%)",
    mutedForeground: "hsl(0, 0%, 73%)",
    accent: "hsl(0, 0%, 20%)",
    accentForeground: "hsl(0, 0%, 95%)",
    destructive: "hsl(8, 85%, 74%)",
    destructiveForeground: "hsl(0, 0%, 9%)",
    success: "hsl(150, 58%, 66%)",
    successForeground: "hsl(0, 0%, 9%)",
    surface: "hsl(0, 0%, 12%)",
    border: "hsl(0, 0%, 28%)",
    input: "hsl(0, 0%, 52%)",
    chart1: "hsl(12, 76%, 72%)",
    chart2: "hsl(173, 58%, 65%)",
    chart3: "hsl(197, 60%, 70%)",
    chart4: "hsl(43, 74%, 70%)",
    chart5: "hsl(262, 75%, 78%)",
    primary: "hsl(0, 0%, 88%)",
    primaryForeground: "hsl(0, 0%, 12%)",
    action: "hsl(0, 0%, 88%)",
    actionForeground: "hsl(0, 0%, 12%)",
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
