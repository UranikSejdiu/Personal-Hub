import { Tabs, useRouter } from "expo-router";
import { Easing, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, CheckSquare, Settings } from "../../src/components/AppIcons";
import { NavigationBar } from "../../src/components/NavigationBar";
import { useThemeColors } from "../../src/lib/theme";

const TASK_TABS = [
  { id: "index", href: "/(tasks)", label: "Today", icon: CheckSquare },
  { id: "calendar", href: "/(tasks)/calendar", label: "Calendar", icon: CalendarDays },
  { id: "settings", href: "/(tasks)/settings", label: "Settings", icon: Settings },
] as const;

export default function TasksLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  return <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
    <Tabs
      screenOptions={() => ({
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
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
          tabs={TASK_TABS}
          activeTabId={state.routes[state.index].name}
          onTabPress={(id) => {
            const tab = TASK_TABS.find((destination) => destination.id === id);
            if (tab) router.navigate(tab.href);
          }}
        />
      )}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="lists" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="all" options={{ href: null }} />
    </Tabs>
  </View>;
}
