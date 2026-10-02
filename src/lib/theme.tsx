import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { colorScheme, vars } from "nativewind";
import * as SecureStore from "expo-secure-store";
import {
  getThemeColors,
  getThemeVariables,
  type ThemeName,
  type ThemeColors,
} from "../constants/theme";

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
    try {
      const stored = SecureStore.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") return stored;
      if (stored === "tawheed") return "dark";
    } catch {
      // SecureStore unavailable (keychain failure) — fall through to system scheme.
    }
    return systemScheme === "dark" ? "dark" : "light";
  });

  // Migration side effect must not run during render (initializers stay pure).
  useEffect(() => {
    try {
      if (SecureStore.getItem(THEME_KEY) === "tawheed") {
        void SecureStore.setItemAsync(THEME_KEY, "dark").catch((err) => {
          console.warn("[theme] failed to migrate tawheed preference:", err);
        });
      }
    } catch {
      // SecureStore unavailable — nothing to migrate.
    }
  }, []);
  // Keep NativeWind's dark: variants aligned with the app's saved preference.
  useEffect(() => {
    colorScheme.set(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    void SecureStore.setItemAsync(THEME_KEY, next).catch((err) => {
      // Non-critical: theme applies in-memory; persist failure only affects restart.
      console.warn("[theme] failed to persist theme:", err);
    });
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

export type { ThemeColors } from "../constants/theme";

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();
  return useMemo(
    () => getThemeColors(theme),
    [theme]
  );
}

export function useThemeVariables() {
  const colors = useThemeColors();
  return useMemo(() => vars(getThemeVariables(colors)), [colors]);
}
