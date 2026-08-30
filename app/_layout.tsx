import { useEffect, useState } from "react";
import { Stack, SplashScreen } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Toaster } from "sonner-native";
import { useFonts } from "expo-font";
import "../global.css";
import { ThemeProvider, useTheme } from "../src/lib/theme";
import { I18nProvider } from "../src/lib/i18n";
import { initDatabase } from "../src/lib/db";
import { View } from "react-native";

SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { theme, resolvedTheme } = useTheme();

  return (
    <View className={theme} style={{ flex: 1 }}>
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
            <RootLayoutInner />
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
