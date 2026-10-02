import { useCallback, useEffect, useRef, useState } from "react";
import { Stack, SplashScreen, useRouter, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BackHandler, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "sonner-native";
import { useFonts } from "expo-font";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "../global.css";
import { ThemeProvider, useTheme, useThemeColors, useThemeVariables } from "../src/lib/theme";
import { I18nProvider, useI18n } from "../src/lib/i18n";
import { UpdateProvider } from "../src/lib/UpdateContext";
import { initDatabase } from "../src/lib/db";
import { migrateLegacyRepayments } from "../src/lib/repaymentMigration";
import { seedSampleData } from "../src/lib/sampleData";
import { ConfirmDialog } from "../src/components/ConfirmDialog";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unsupported — safe to ignore.
});

function RootLayoutInner() {
  const { resolvedTheme } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const themeVariables = useThemeVariables();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const [showExitDialog, setShowExitDialog] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (pathnameRef.current.includes("/settings")) return false;
        if (router.canGoBack()) return false;
        setShowExitDialog(true);
        return true;
      }
    );
    return () => subscription.remove();
  }, [router]);

  return (
    <View
      className="flex-1 bg-background"
      style={themeVariables}
    >
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tutorial)" />
        <Stack.Screen name="(budget)" />
        <Stack.Screen name="(dhikr)" />
        <Stack.Screen name="(notes)" />
        <Stack.Screen name="settings/[section]" />
      </Stack>
      <Toaster
        position="top-center"
        offset={insets.top + 64}
        positionerStyle={{ maxWidth: 400, alignSelf: "center" }}
        theme={resolvedTheme}
        visibleToasts={2}
        toastOptions={{
          style: {
            marginHorizontal: 16,
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          },
          toastContentStyle: { gap: 10 },
          titleStyle: { color: colors.foreground, fontSize: 14, lineHeight: 20 },
        }}
      />
      <ConfirmDialog
        visible={showExitDialog}
        title={t("exitTitle")}
        message={t("exitMessage")}
        confirmLabel={t("exitApp")}
        cancelLabel={t("cancel")}
        destructive
        onClose={() => setShowExitDialog(false)}
        onConfirm={() => BackHandler.exitApp()}
      />
    </View>
  );
}

function BootstrapGate() {
  const themeVariables = useThemeVariables();
  const { t } = useI18n();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        await migrateLegacyRepayments();
        if (!cancelled) setDbReady(true);
        // Demo data for a first run, seeded in the background so it never
        // delays first paint. Screens reload on focus, so it is picked up
        // whenever it lands; a failure is never fatal and retries next launch.
        void seedSampleData().catch(() => {
          // Non-critical — the app is fully usable without demo data.
        });
      } catch (err) {
        if (!cancelled) {
          setDbError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dbReady || dbError) {
      void SplashScreen.hideAsync().catch(() => {
        // Already hidden — safe to ignore.
      });
    }
  }, [dbReady, dbError]);

  const retryDb = useCallback(() => {
    setDbError(null);
    setDbReady(false);
    void initDatabase()
      .then(() => migrateLegacyRepayments())
      .then(() => setDbReady(true))
      .catch((err: unknown) => {
        setDbError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (dbError) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        style={themeVariables}
      >
        <Text className="text-base font-semibold text-foreground">{t("dbInitFailed")}</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">{dbError}</Text>
        <Pressable
          onPress={retryDb}
          className="mt-4 rounded-lg bg-primary px-5 py-2.5"
          accessibilityRole="button"
          accessibilityLabel={t("retry")}
        >
          <Text className="text-sm font-semibold text-primary-foreground">{t("retry")}</Text>
        </Pressable>
      </View>
    );
  }

  if (!dbReady) return null;

  return <RootLayoutInner />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Urbanist-Regular": require("../assets/fonts/Urbanist-Regular.ttf"),
    "Urbanist-Medium": require("../assets/fonts/Urbanist-Medium.ttf"),
    "Urbanist-SemiBold": require("../assets/fonts/Urbanist-SemiBold.ttf"),
    "Urbanist-Bold": require("../assets/fonts/Urbanist-Bold.ttf"),
    Uicons: require("../assets/fonts/uicons-regular-rounded.ttf"),
  });

  useEffect(() => {
    if (fontError) {
      // Fall back to system fonts instead of blocking the splash forever.
      console.warn("[fonts] failed to load custom fonts:", fontError);
    }
  }, [fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <I18nProvider>
              <UpdateProvider>
                <BootstrapGate />
              </UpdateProvider>
            </I18nProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
