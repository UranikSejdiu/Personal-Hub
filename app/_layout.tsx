import { useCallback, useEffect, useState } from "react";
import { Stack, SplashScreen, useRouter, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BackHandler, Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "sonner-native";
import { useFonts } from "expo-font";
import "../global.css";
import { ThemeProvider, useTheme } from "../src/lib/theme";
import { I18nProvider, useI18n } from "../src/lib/i18n";
import { UpdateProvider } from "../src/lib/UpdateContext";
import { initDatabase } from "../src/lib/db";
import { ConfirmDialog } from "../src/components/ConfirmDialog";

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unsupported — safe to ignore.
});

function RootLayoutInner() {
  const { theme, resolvedTheme, accent } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [showExitDialog, setShowExitDialog] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (pathname.includes("/settings")) return false;
        if (router.canGoBack()) return false;
        setShowExitDialog(true);
        return true;
      }
    );
    return () => subscription.remove();
  }, [router, pathname]);

  return (
    <View
      className={`${theme} ${accent === "blue" ? "" : `accent-${accent}`}`}
      style={{ flex: 1 }}
    >
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tutorial)" />
        <Stack.Screen name="(budget)" />
        <Stack.Screen name="(dhikr)" />
        <Stack.Screen name="(notes)" />
      </Stack>
      <Toaster
        position="bottom-center"
        theme={resolvedTheme}
        richColors
        closeButton
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
  const { theme, accent } = useTheme();
  const { t } = useI18n();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initDatabase();
        if (!cancelled) setDbReady(true);
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
      .then(() => setDbReady(true))
      .catch((err: unknown) => {
        setDbError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  if (dbError) {
    return (
      <View
        className={`${theme} ${accent === "blue" ? "" : `accent-${accent}`} flex-1 items-center justify-center bg-background px-6`}
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
  const [fontsLoaded] = useFonts({
    "Urbanist-Regular": require("../assets/fonts/Urbanist-Regular.ttf"),
    "Urbanist-Medium": require("../assets/fonts/Urbanist-Medium.ttf"),
    "Urbanist-SemiBold": require("../assets/fonts/Urbanist-SemiBold.ttf"),
    "Urbanist-Bold": require("../assets/fonts/Urbanist-Bold.ttf"),
    Uicons: require("../assets/fonts/uicons-regular-rounded.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <UpdateProvider>
              <BootstrapGate />
            </UpdateProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
