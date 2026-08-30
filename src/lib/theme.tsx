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
import { COLORS, type ThemeName } from "../constants/theme";

export const THEMES: { value: ThemeName; labelKey: string }[] = [
  { value: "light", labelKey: "themeLight" },
  { value: "dark", labelKey: "themeDark" },
  { value: "tawheed", labelKey: "themeTawheed" },
];

const THEME_KEY = "app_theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const stored = SecureStore.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "tawheed") {
      return stored;
    }
    return systemScheme === "dark" ? "dark" : "light";
  });

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    SecureStore.setItem(THEME_KEY, next);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "light" ? "light" : "dark";

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
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

export type ThemeColors = (typeof COLORS)[ThemeName];

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return useMemo(() => COLORS[theme], [theme]);
}
