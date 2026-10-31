export type ThemeName = "light" | "dark";

/** Shared by NativeWind variables, icons, inputs, and native controls. */
export const COLORS = {
  light: {
    background: "hsl(60, 23.1%, 97.5%)",
    foreground: "hsl(120, 5.9%, 13.3%)",
    card: "hsl(60, 12.8%, 92.4%)",
    cardForeground: "hsl(120, 5.9%, 13.3%)",
    secondary: "hsl(80, 11.5%, 89.8%)",
    secondaryForeground: "hsl(120, 5.9%, 13.3%)",
    muted: "hsl(80, 11.5%, 89.8%)",
    mutedForeground: "hsl(120, 4.2%, 37.3%)",
    accent: "hsl(80, 11.5%, 89.8%)",
    accentForeground: "hsl(120, 5.9%, 13.3%)",
    destructive: "hsl(0, 72%, 43%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 65%, 26%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(72, 17.2%, 94.3%)",
    border: "hsl(87, 9.7%, 81.8%)",
    input: "hsl(94, 7.4%, 57.6%)",
    chart1: "hsl(12, 76%, 38%)",
    chart2: "hsl(173, 65%, 27%)",
    chart3: "hsl(197, 55%, 30%)",
    chart4: "hsl(43, 80%, 28%)",
    chart5: "hsl(262, 65%, 45%)",
    primary: "hsl(223, 60.2%, 48.2%)",
    primaryForeground: "hsl(0, 0.0%, 100.0%)",
    action: "hsl(225, 100%, 59%)",
    actionForeground: "hsl(0, 0%, 100%)",
  },
  dark: {
    background: "hsl(210, 6.5%, 12.2%)",
    foreground: "hsl(60, 20.0%, 95.1%)",
    card: "hsl(210, 6.8%, 17.3%)",
    cardForeground: "hsl(60, 20.0%, 95.1%)",
    secondary: "hsl(206, 6.4%, 21.4%)",
    secondaryForeground: "hsl(60, 20.0%, 95.1%)",
    muted: "hsl(206, 6.4%, 21.4%)",
    mutedForeground: "hsl(213, 6.4%, 72.4%)",
    accent: "hsl(206, 6.4%, 21.4%)",
    accentForeground: "hsl(60, 20.0%, 95.1%)",
    destructive: "hsl(8, 85%, 74%)",
    destructiveForeground: "hsl(222, 60%, 12%)",
    success: "hsl(150, 58%, 66%)",
    successForeground: "hsl(222, 60%, 12%)",
    surface: "hsl(204, 6.5%, 15.1%)",
    border: "hsl(207, 6.5%, 27.3%)",
    input: "hsl(207, 7.4%, 52.2%)",
    chart1: "hsl(12, 76%, 72%)",
    chart2: "hsl(173, 58%, 65%)",
    chart3: "hsl(197, 60%, 70%)",
    chart4: "hsl(43, 74%, 70%)",
    chart5: "hsl(262, 75%, 78%)",
    primary: "hsl(224, 100.0%, 82.2%)",
    primaryForeground: "hsl(223, 54.0%, 19.6%)",
    action: "hsl(225, 100%, 59%)",
    actionForeground: "hsl(0, 0%, 100%)",
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
