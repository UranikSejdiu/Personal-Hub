export type ThemeName = "light" | "dark";

/** Shared by NativeWind variables, icons, inputs, and native controls. */
export const COLORS = {
  light: {
    background: "hsl(214, 65%, 97%)",
    foreground: "hsl(222, 60%, 16%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(222, 60%, 16%)",
    secondary: "hsl(214, 50%, 94%)",
    secondaryForeground: "hsl(222, 60%, 16%)",
    muted: "hsl(214, 50%, 94%)",
    mutedForeground: "hsl(218, 25%, 40%)",
    accent: "hsl(214, 50%, 94%)",
    accentForeground: "hsl(222, 60%, 16%)",
    destructive: "hsl(0, 72%, 43%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 65%, 29%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(214, 50%, 96%)",
    border: "hsl(214, 35%, 84%)",
    input: "hsl(214, 30%, 75%)",
    chart1: "hsl(12, 76%, 38%)",
    chart2: "hsl(173, 65%, 29%)",
    chart3: "hsl(197, 55%, 30%)",
    chart4: "hsl(43, 80%, 28%)",
    chart5: "hsl(262, 65%, 45%)",
    primary: "hsl(221, 75%, 42%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  dark: {
    background: "hsl(222, 60%, 7%)",
    foreground: "hsl(214, 70%, 96%)",
    card: "hsl(222, 48%, 11%)",
    cardForeground: "hsl(214, 70%, 96%)",
    secondary: "hsl(220, 38%, 16%)",
    secondaryForeground: "hsl(214, 70%, 96%)",
    muted: "hsl(220, 38%, 16%)",
    mutedForeground: "hsl(215, 30%, 73%)",
    accent: "hsl(220, 38%, 16%)",
    accentForeground: "hsl(214, 70%, 96%)",
    destructive: "hsl(8, 85%, 74%)",
    destructiveForeground: "hsl(222, 60%, 12%)",
    success: "hsl(150, 58%, 66%)",
    successForeground: "hsl(222, 60%, 12%)",
    surface: "hsl(220, 38%, 16%)",
    border: "hsl(218, 30%, 26%)",
    input: "hsl(216, 28%, 40%)",
    chart1: "hsl(12, 76%, 72%)",
    chart2: "hsl(173, 58%, 65%)",
    chart3: "hsl(197, 60%, 70%)",
    chart4: "hsl(43, 74%, 70%)",
    chart5: "hsl(262, 75%, 78%)",
    primary: "hsl(210, 90%, 72%)",
    primaryForeground: "hsl(222, 60%, 12%)",
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
