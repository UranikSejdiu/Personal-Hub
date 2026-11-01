import { Tabs, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, CheckSquare, Settings } from "../../src/components/AppIcons";
import { Text } from "../../src/components/ui/Typography";
import { useThemeColors } from "../../src/lib/theme";

const NAV = [{ name: "index", href: "/(tasks)", label: "Today", icon: CheckSquare }, { name: "calendar", href: "/(tasks)/calendar", label: "Calendar", icon: CalendarDays }, { name: "settings", href: "/(tasks)/settings", label: "Settings", icon: Settings }] as const;

export default function TasksLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  return <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
    <Tabs screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: true }} tabBar={({ state }) => {
      const current = state.routes[state.index].name;
      const buttons = NAV.map(tab => <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: current === tab.name }} onPress={() => router.navigate(tab.href)} className="min-h-[54px] min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl px-1 active:opacity-60">
        <tab.icon size={19} color={current === tab.name ? colors.primary : colors.mutedForeground} /><Text className="text-[10px]" style={{ color: current === tab.name ? colors.primary : colors.mutedForeground }}>{tab.label}</Text><View className="h-[3px] w-[3px] rounded-full" style={{ backgroundColor: current === tab.name ? colors.primary : "transparent" }} />
      </Pressable>);
      return <View className="flex-row items-center rounded-t-[26px] bg-card px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {buttons}
      </View>;
    }}>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
      <Tabs.Screen name="lists" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="all" options={{ href: null }} />
    </Tabs>
  </View>;
}
