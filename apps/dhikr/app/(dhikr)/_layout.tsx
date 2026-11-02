import { Tabs, useRouter } from "expo-router";
import { Easing, Image, View } from "react-native";
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
  return (
    <>
      <View className="bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-2.5 px-4 py-3">
          <Image source={require("../../assets/branding/icon.png")} className="h-[36px] w-[36px] rounded-[12px]" accessible={false} />
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">{t("appName")}</Text>
        </View>
      </View>
      <Tabs
        screenOptions={() => ({
          headerShown: false,
          animation: reducedMotion ? "none" : "shift",
          transitionSpec: {
            animation: "timing",
            config: { duration: reducedMotion ? 0 : 200, easing: Easing.bezier(0.2, 0, 0, 1) },
          },
          sceneStyle: { backgroundColor: colors.background },
          // Keep the same short path when focus changes or a transition reverses.
          // Opacity and translation run on the navigator's native animation driver.
          sceneStyleInterpolator: reducedMotion ? undefined : ({ current }) => ({
            sceneStyle: {
              opacity: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [0, 1, 0],
                extrapolate: "clamp",
              }),
              transform: [{
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-16, 0, 16],
                  extrapolate: "clamp",
                }),
              }],
            },
          }),
        })}
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
