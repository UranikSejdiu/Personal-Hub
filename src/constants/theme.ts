export type ThemeName = "light" | "dark";

export type AccentName = "blue" | "green" | "purple" | "teal" | "orange" | "pink" | "indigo";

interface AccentColor {
  primary: string;
  primaryForeground: string;
}

function makeAccent(light: string, dark: string): Record<ThemeName, AccentColor> {
  return {
    light: { primary: light, primaryForeground: "hsl(0, 0%, 100%)" },
    dark: { primary: dark, primaryForeground: "hsl(225, 18%, 10%)" },
  };
}

export const ACCENT_COLORS: Record<AccentName, Record<ThemeName, AccentColor>> = {
  blue: makeAccent("hsl(221, 83%, 48%)", "hsl(221, 90%, 76%)"),
  green: makeAccent("hsl(142, 64%, 28%)", "hsl(142, 60%, 65%)"),
  purple: makeAccent("hsl(262, 72%, 48%)", "hsl(262, 85%, 80%)"),
  teal: makeAccent("hsl(173, 65%, 26%)", "hsl(173, 60%, 65%)"),
  orange: makeAccent("hsl(24, 85%, 35%)", "hsl(24, 85%, 70%)"),
  pink: makeAccent("hsl(330, 70%, 42%)", "hsl(330, 80%, 76%)"),
  indigo: makeAccent("hsl(245, 75%, 58%)", "hsl(239, 84%, 80%)"),
};

/** Shared by NativeWind variables, icons, inputs, and native controls. */
export const COLORS = {
  light: {
    background: "hsl(220, 20%, 97%)",
    foreground: "hsl(225, 18%, 12%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(225, 18%, 12%)",
    secondary: "hsl(220, 16%, 94%)",
    secondaryForeground: "hsl(225, 18%, 12%)",
    muted: "hsl(220, 16%, 94%)",
    mutedForeground: "hsl(220, 10%, 43%)",
    accent: "hsl(220, 16%, 94%)",
    accentForeground: "hsl(225, 18%, 12%)",
    destructive: "hsl(0, 72%, 43%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 65%, 29%)",
    successForeground: "hsl(0, 0%, 100%)",
    surface: "hsl(220, 16%, 96%)",
    border: "hsl(220, 14%, 87%)",
    input: "hsl(220, 14%, 80%)",
    chart1: "hsl(12, 76%, 38%)",
    chart2: "hsl(173, 65%, 29%)",
    chart3: "hsl(197, 55%, 30%)",
    chart4: "hsl(43, 80%, 28%)",
    chart5: "hsl(262, 65%, 45%)",
  },
  dark: {
    background: "hsl(225, 11%, 7%)",
    foreground: "hsl(225, 20%, 96%)",
    card: "hsl(225, 13%, 12%)",
    cardForeground: "hsl(225, 20%, 96%)",
    secondary: "hsl(225, 12%, 17%)",
    secondaryForeground: "hsl(225, 20%, 96%)",
    muted: "hsl(225, 12%, 17%)",
    mutedForeground: "hsl(225, 12%, 70%)",
    accent: "hsl(225, 12%, 17%)",
    accentForeground: "hsl(225, 20%, 96%)",
    destructive: "hsl(0, 85%, 73%)",
    destructiveForeground: "hsl(225, 18%, 10%)",
    success: "hsl(142, 60%, 65%)",
    successForeground: "hsl(225, 18%, 10%)",
    surface: "hsl(225, 12%, 17%)",
    border: "hsl(225, 12%, 23%)",
    input: "hsl(225, 12%, 38%)",
    chart1: "hsl(12, 76%, 72%)",
    chart2: "hsl(173, 58%, 65%)",
    chart3: "hsl(197, 60%, 70%)",
    chart4: "hsl(43, 74%, 70%)",
    chart5: "hsl(262, 75%, 78%)",
  },
} as const;

export const ACCENT_ORDER: AccentName[] = [
  "blue",
  "indigo",
  "green",
  "purple",
  "teal",
  "orange",
  "pink",
];

export function isAccentName(value: string | null | undefined): value is AccentName {
  return typeof value === "string" && Object.hasOwn(ACCENT_COLORS, value);
}

export function getThemeColors(theme: ThemeName, accent: AccentName) {
  const selectedAccent = ACCENT_COLORS[accent][theme];
  return { ...COLORS[theme], ...selectedAccent, ring: selectedAccent.primary };
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
