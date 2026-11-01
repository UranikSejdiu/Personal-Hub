export type ThemeName = "light" | "dark";

/** Shared by NativeWind variables, icons, inputs, and native controls. */
export const COLORS = {
  light: {
    background: "hsl(72, 25%, 97%)",
    foreground: "hsl(137, 16%, 18%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(137, 16%, 18%)",
    secondary: "hsl(78, 28%, 90%)",
    secondaryForeground: "hsl(137, 16%, 18%)",
    muted: "hsl(78, 28%, 90%)",
    mutedForeground: "hsl(102, 8%, 38%)",
    accent: "hsl(78, 28%, 90%)",
    accentForeground: "hsl(137, 16%, 18%)",
    destructive: "hsl(0, 72%, 43%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 65%, 29%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(75, 22%, 94%)",
    border: "hsl(78, 16%, 83%)",
    input: "hsl(100, 10%, 69%)",
    chart1: "hsl(12, 76%, 38%)",
    chart2: "hsl(173, 65%, 29%)",
    chart3: "hsl(197, 55%, 30%)",
    chart4: "hsl(43, 80%, 28%)",
    chart5: "hsl(262, 65%, 45%)",
    primary: "hsl(142, 18%, 30%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  dark: {
    background: "hsl(140, 17%, 8%)",
    foreground: "hsl(75, 22%, 94%)",
    card: "hsl(140, 14%, 12%)",
    cardForeground: "hsl(75, 22%, 94%)",
    secondary: "hsl(135, 12%, 17%)",
    secondaryForeground: "hsl(75, 22%, 94%)",
    muted: "hsl(135, 12%, 17%)",
    mutedForeground: "hsl(90, 12%, 72%)",
    accent: "hsl(135, 12%, 17%)",
    accentForeground: "hsl(75, 22%, 94%)",
    destructive: "hsl(8, 85%, 74%)",
    destructiveForeground: "hsl(140, 17%, 10%)",
    success: "hsl(150, 58%, 66%)",
    successForeground: "hsl(140, 17%, 10%)",
    surface: "hsl(135, 12%, 17%)",
    border: "hsl(130, 10%, 27%)",
    input: "hsl(130, 10%, 40%)",
    chart1: "hsl(12, 76%, 72%)",
    chart2: "hsl(173, 58%, 65%)",
    chart3: "hsl(197, 60%, 70%)",
    chart4: "hsl(43, 74%, 70%)",
    chart5: "hsl(262, 75%, 78%)",
    primary: "hsl(100, 25%, 74%)",
    primaryForeground: "hsl(140, 17%, 10%)",
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
