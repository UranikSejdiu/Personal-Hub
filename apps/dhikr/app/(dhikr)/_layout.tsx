import { Tabs, useRouter } from "expo-router";
import { Easing, Image, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/ui/Typography";
import { PillNav } from "../../src/components/PillNav";
import { useI18n } from "../../src/lib/i18n";
import { useThemeColors } from "../../src/lib/theme";

export default function DhikrLayout() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  return (
    <>
      <View className="bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-2.5 px-4 py-3">
          <Image source={require("../../assets/branding/icon.png")} className="h-[36px] w-[36px] rounded-[12px]" accessible={false} />
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">{t("appName")}</Text>
        </View>
      </View>
      <Tabs
        screenOptions={({ navigation }) => {
          const focused = navigation.isFocused();
          return {
            headerShown: false,
            animation: reducedMotion ? "none" : "shift",
            transitionSpec: {
              animation: "timing",
              config: { duration: reducedMotion ? 0 : 320, easing: Easing.bezier(0.2, 0, 0, 1) },
            },
            sceneStyle: { backgroundColor: colors.background },
            // The focused scene sits above the outgoing scene in the tab renderer.
            // Slide it over a gently receding page, without cross-fading either one.
            sceneStyleInterpolator: reducedMotion ? undefined : ({ current }) => ({
              sceneStyle: {
                overflow: "hidden",
                borderRadius: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [24, 0, 24],
                  extrapolate: "clamp",
                }),
                transform: [
                  {
                    translateX: current.progress.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: focused ? [-width, 0, width] : [-width * 0.16, 0, width * 0.16],
                      extrapolate: "clamp",
                    }),
                  },
                  {
                    scale: current.progress.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: focused ? [0.98, 1, 0.98] : [0.96, 1, 0.96],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              },
            }),
          };
        }}
        tabBar={({ state }) => (
          <PillNav tabs={[
            { id: "index", label: t("navCounter"), icon: "star-four-points" },
            { id: "list", label: t("navDhikrList"), icon: "format-list-numbered" },
            { id: "settings", label: t("navSettings"), icon: "cog" },
          ]} activeTabId={state.routes[state.index].name} onTabPress={(id) => {
            if (id === "index") router.navigate("/(dhikr)");
            else if (id === "list") router.navigate("/(dhikr)/list");
            else if (id === "settings") router.navigate("/(dhikr)/settings");
          }} />
        )}>
        <Tabs.Screen name="index" options={{ title: t("navCounter") }} />
        <Tabs.Screen name="list" options={{ title: t("navDhikrList") }} />
        <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
      </Tabs>
    </>
  );
}
