import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  COLORS,
  ACCENT_COLORS,
  isAccentName,
  type AccentName,
  type ThemeName,
} from "../constants/theme";

export const THEMES: { value: ThemeName; labelKey: string }[] = [
  { value: "light", labelKey: "themeLight" },
  { value: "dark", labelKey: "themeDark" },
];

const THEME_KEY = "app_theme";
const ACCENT_KEY = "app_accent";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  resolvedTheme: "light" | "dark";
  accent: AccentName;
  setAccent: (accent: AccentName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = SecureStore.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
    if (stored === "tawheed") return "dark";
    return systemScheme === "dark" ? "dark" : "light";
  });
  const [accent, setAccentState] = useState<AccentName>(() => {
    const stored = SecureStore.getItem(ACCENT_KEY);
    return isAccentName(stored) ? stored : "blue";
  });

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    SecureStore.setItem(THEME_KEY, next);
  }, []);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    SecureStore.setItem(ACCENT_KEY, next);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "light" ? "light" : "dark";

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme, accent, setAccent }),
    [theme, setTheme, resolvedTheme, accent, setAccent]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider.");
  return ctx;
}

type BaseThemeColors = (typeof COLORS)[ThemeName];

export type ThemeColors = Omit<BaseThemeColors, "primary" | "primaryForeground"> & {
  primary: string;
  primaryForeground: string;
};

export function useThemeColors(): ThemeColors {
  const { theme, accent } = useTheme();
  return useMemo(
    () => ({
      ...COLORS[theme],
      primary: ACCENT_COLORS[accent].primary,
      primaryForeground: ACCENT_COLORS[accent].primaryForeground,
    }),
    [theme, accent]
  );
}
