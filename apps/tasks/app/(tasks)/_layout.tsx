import { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { Easing, I18nManager, Pressable, View, type LayoutRectangle } from "react-native";
import Animated, { Easing as ReanimatedEasing, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, CheckSquare, Settings } from "../../src/components/AppIcons";
import { Text } from "../../src/components/ui/Typography";
import { useThemeColors } from "../../src/lib/theme";

const NAV = [{ name: "index", href: "/(tasks)", label: "Today", icon: CheckSquare }, { name: "calendar", href: "/(tasks)/calendar", label: "Calendar", icon: CalendarDays }, { name: "settings", href: "/(tasks)/settings", label: "Settings", icon: Settings }] as const;

const TAB_HIGHLIGHT_TRANSITION = LinearTransition.duration(200).easing(ReanimatedEasing.bezier(0.2, 0, 0, 1));

function TasksTabBar({ current }: { current: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [tabLayouts, setTabLayouts] = useState<Partial<Record<string, LayoutRectangle>>>({});
  const activeLayout = tabLayouts[current];

  return (
    <View className="flex-row items-center rounded-t-[26px] bg-card px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      {activeLayout && (
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no"
          layout={TAB_HIGHLIGHT_TRANSITION}
          className="absolute rounded-2xl bg-primary/10"
          style={{
            [I18nManager.isRTL ? "end" : "start"]: activeLayout.x,
            top: activeLayout.y,
            width: activeLayout.width,
            height: activeLayout.height,
          }}
        />
      )}
      {NAV.map((tab) => {
        const isActive = current === tab.name;
        const color = isActive ? colors.primary : colors.mutedForeground;
        return (
          <Pressable
            key={tab.name}
            onLayout={({ nativeEvent: { layout } }) => {
              setTabLayouts((previous) => ({ ...previous, [tab.name]: layout }));
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
            onPress={() => router.navigate(tab.href)}
            className="min-h-[54px] min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl px-1 active:opacity-60"
          >
            <tab.icon size={19} color={color} />
            <Text className="text-[10px]" style={{ color }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TasksLayout() {
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
      tabBar={({ state }) => <TasksTabBar current={state.routes[state.index].name} />}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="lists" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="all" options={{ href: null }} />
    </Tabs>
  </View>;
}
