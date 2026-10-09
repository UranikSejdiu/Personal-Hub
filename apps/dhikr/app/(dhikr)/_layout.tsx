import { Tabs, useRouter } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../src/components/ui/Typography";
import { PillNav } from "../../src/components/PillNav";
import { useI18n } from "../../src/lib/i18n";

export default function DhikrLayout() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <>
      <View className="bg-background" style={{ paddingTop: insets.top }}>
        <Text accessibilityRole="header" className="px-4 py-3 text-xl font-bold text-foreground">{t("appName")}</Text>
      </View>
      <Tabs screenOptions={{ headerShown: false }} tabBar={({ state }) => (
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
