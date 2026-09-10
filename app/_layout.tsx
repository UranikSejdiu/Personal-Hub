import { useEffect, useState } from "react";
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

SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "Urbanist-Regular": require("../assets/fonts/Urbanist-Regular.ttf"),
    "Urbanist-Medium": require("../assets/fonts/Urbanist-Medium.ttf"),
    "Urbanist-SemiBold": require("../assets/fonts/Urbanist-SemiBold.ttf"),
    "Urbanist-Bold": require("../assets/fonts/Urbanist-Bold.ttf"),
  });
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
          setDbError(err instanceof Error ? err.message : "Database initialization failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, dbReady]);

  if (dbError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, textAlign: "center" }}>
          Failed to initialize database
        </Text>
        <Text style={{ fontSize: 14, color: "#888", marginBottom: 16, textAlign: "center" }}>
          {dbError}
        </Text>
        <Pressable
          onPress={() => {
            setDbError(null);
            setDbReady(false);
            void initDatabase()
              .then(() => setDbReady(true))
              .catch((err) => setDbError(err instanceof Error ? err.message : "Database initialization failed"));
          }}
          style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#007AFF", borderRadius: 8 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!fontsLoaded || !dbReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <UpdateProvider>
              <RootLayoutInner />
            </UpdateProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
