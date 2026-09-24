export const COLORS = {
  light: {
    background: "hsl(0, 0%, 100%)",
    foreground: "hsl(240, 10%, 3.9%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(240, 10%, 3.9%)",
    primary: "hsl(221, 83%, 53%)",
    primaryForeground: "hsl(0, 0%, 100%)",
    secondary: "hsl(240, 4.8%, 95.9%)",
    secondaryForeground: "hsl(240, 5.9%, 10%)",
    muted: "hsl(240, 4.8%, 95.9%)",
    mutedForeground: "hsl(240, 3.8%, 46.1%)",
    accent: "hsl(240, 4.8%, 95.9%)",
    accentForeground: "hsl(240, 5.9%, 10%)",
    destructive: "hsl(0, 84.2%, 52%)",
    destructiveForeground: "hsl(0, 0%, 98%)",
    success: "hsl(142, 76%, 36%)",
    successForeground: "hsl(0, 0%, 98%)",
    surface: "hsl(240, 4.8%, 95.9%)",
    border: "hsl(240, 5.9%, 90%)",
    input: "hsl(240, 5.9%, 90%)",
    ring: "hsl(240, 5.9%, 10%)",
  },
  dark: {
    background: "hsl(240, 10%, 3.9%)",
    foreground: "hsl(0, 0%, 98%)",
    card: "hsl(240, 10%, 3.9%)",
    cardForeground: "hsl(0, 0%, 98%)",
    primary: "hsl(221, 83%, 53%)",
    primaryForeground: "hsl(0, 0%, 100%)",
    secondary: "hsl(240, 3.7%, 15.9%)",
    secondaryForeground: "hsl(0, 0%, 98%)",
    muted: "hsl(240, 3.7%, 15.9%)",
    mutedForeground: "hsl(240, 5%, 64.9%)",
    accent: "hsl(240, 3.7%, 15.9%)",
    accentForeground: "hsl(0, 0%, 98%)",
    destructive: "hsl(0, 93.2%, 58%)",
    destructiveForeground: "hsl(0, 0%, 98%)",
    success: "hsl(142, 71%, 45%)",
    successForeground: "hsl(0, 0%, 98%)",
    surface: "hsl(240, 3.7%, 15.9%)",
    border: "hsl(240, 3.7%, 15.9%)",
    input: "hsl(240, 3.7%, 15.9%)",
    ring: "hsl(240, 4.9%, 83.9%)",
  },
} as const;

export type ThemeName = "light" | "dark";

export type AccentName = "blue" | "green" | "purple" | "teal" | "orange" | "pink";

interface AccentColor {
  primary: string;
  primaryForeground: string;
}

export const ACCENT_COLORS: Record<AccentName, AccentColor> = {
  blue: {
    primary: "hsl(221, 83%, 53%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  green: {
    primary: "hsl(142, 71%, 36%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  purple: {
    primary: "hsl(262, 83%, 58%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  teal: {
    primary: "hsl(173, 65%, 30%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  orange: {
    primary: "hsl(24, 95%, 48%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
  pink: {
    primary: "hsl(330, 81%, 57%)",
    primaryForeground: "hsl(0, 0%, 100%)",
  },
};

export const ACCENT_ORDER: AccentName[] = [
  "blue",
  "green",
  "purple",
  "teal",
  "orange",
  "pink",
];

export function isAccentName(value: string | null | undefined): value is AccentName {
  return typeof value === "string" && value in ACCENT_COLORS;
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

export const NOTE_TEXT_COLORS = {
  default: { light: "text-foreground", dark: "text-foreground" },
  yellow: { light: "text-yellow-600", dark: "text-yellow-400" },
  green: { light: "text-green-600", dark: "text-green-400" },
  blue: { light: "text-blue-600", dark: "text-blue-400" },
  pink: { light: "text-pink-600", dark: "text-pink-400" },
  purple: { light: "text-purple-600", dark: "text-purple-400" },
  orange: { light: "text-orange-600", dark: "text-orange-400" },
  red: { light: "text-red-600", dark: "text-red-400" },
} as const;

export const NOTE_TEXT_HEX: Record<NoteColor, { light: string; dark: string }> = {
  default: { light: "#1f2937", dark: "#e5e7eb" },
  yellow: { light: "#ca8a04", dark: "#facc15" },
  green: { light: "#16a34a", dark: "#4ade80" },
  blue: { light: "#2563eb", dark: "#60a5fa" },
  pink: { light: "#db2777", dark: "#f472b6" },
  purple: { light: "#9333ea", dark: "#c084fc" },
  orange: { light: "#ea580c", dark: "#fb923c" },
  red: { light: "#dc2626", dark: "#f87171" },
};
