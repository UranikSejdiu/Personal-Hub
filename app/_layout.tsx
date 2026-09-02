import { useEffect, useState } from "react";
import { Stack, SplashScreen, useRouter, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Alert, BackHandler, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "sonner-native";
import { useFonts } from "expo-font";
import "../global.css";
import { ThemeProvider, useTheme } from "../src/lib/theme";
import { I18nProvider, useI18n } from "../src/lib/i18n";
import { UpdateProvider } from "../src/lib/UpdateContext";
import { initDatabase } from "../src/lib/db";
import { loadSavingsGoal } from "../src/lib/budget";
import { ensureMonthlyAutoDeposit } from "../src/lib/savings";

SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { theme, resolvedTheme, accent } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (pathname.includes("/settings")) return false;
        if (router.canGoBack()) return false;
        Alert.alert(t("exitTitle"), t("exitMessage"), [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("exitApp"),
            style: "destructive",
            onPress: () => BackHandler.exitApp(),
          },
        ]);
        return true;
      }
    );
    return () => subscription.remove();
  }, [router, pathname, t]);

  useEffect(() => {
    loadSavingsGoal().then((sg) => {
      if (sg.goal_amount > 0) {
        ensureMonthlyAutoDeposit(sg.goal_amount);
      }
    });
  }, []);

  return (
    <View
      className={`${theme} ${accent === "blue" ? "" : `accent-${accent}`}`}
      style={{ flex: 1 }}
    >
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initDatabase();
      if (!cancelled) setDbReady(true);
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
