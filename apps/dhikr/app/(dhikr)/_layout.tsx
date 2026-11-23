import { Tabs, useRouter } from "expo-router";
import { Easing, Image, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/ui/Typography";
import { ListOrdered, Settings, Sparkles } from "../../src/components/AppIcons";
import { NavigationBar, type NavigationDestination } from "../../src/components/NavigationBar";
import { useHaptics } from "../../src/hooks/useHaptics";
import { useThemeColors } from "../../src/lib/theme";

const DHIKR_TABS: readonly NavigationDestination[] = [
  { id: "index", label: "Counter", icon: Sparkles },
  { id: "list", label: "Dhikrs", icon: ListOrdered },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function DhikrLayout() {
  const router = useRouter();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  return (
    <>
      <View className="bg-background" style={{ paddingTop: insets.top }}>
        <View className="min-h-[64px] w-full max-w-md flex-row items-center gap-3 self-center px-4 py-2">
          <Image source={require("../../assets/branding/icon.png")} className="h-8 w-8 rounded-lg" accessible={false} />
          <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-medium text-foreground">Dhikr</Text>
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
          <NavigationBar
            tabs={DHIKR_TABS}
            activeTabId={state.routes[state.index].name}
            onTabPress={(id) => {
              void haptics.light();
              if (id === "index") router.navigate("/(dhikr)");
              else if (id === "list") router.navigate("/(dhikr)/list");
              else if (id === "settings") router.navigate("/(dhikr)/settings");
            }}
          />
        )}>
        <Tabs.Screen name="index" options={{ title: "Counter" }} />
        <Tabs.Screen name="list" options={{ title: "Dhikrs" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    </>
  );
}
