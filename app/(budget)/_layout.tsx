import { Tabs, useRouter } from "expo-router";
import { PillNav, type PillNavTab } from "../../src/components/PillNav";
import { HubHeader } from "../../src/components/HubHeader";
import { useI18n } from "../../src/lib/i18n";

const BUDGET_TABS: PillNavTab[] = [
  { id: "index", label: "Paneli", icon: "view-dashboard" },
  { id: "savings", label: "Kursimet", icon: "piggy-bank" },
  { id: "loans", label: "Kreditë", icon: "calculator" },
  { id: "settings", label: "Konfigurimet", icon: "cog" },
];

export default function BudgetLayout() {
  const router = useRouter();
  const { t } = useI18n();

  const handleAppSelect = (appId: string) => {
    if (appId === "dhikr") router.replace("/(dhikr)" as any);
    else if (appId === "notes") router.replace("/(notes)" as any);
    else router.replace("/(budget)" as any);
  };

  return (
    <>
      <HubHeader activeAppId="budget" onAppSelect={handleAppSelect} />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state }) => {
          const routeName = state.routes[state.index].name;
          const isSubScreen = !BUDGET_TABS.some((tab) => tab.id === routeName);
          if (isSubScreen) return null;
          return (
            <PillNav
              tabs={BUDGET_TABS.map((tab) => ({
                ...tab,
               label: t(
                 tab.id === "index"
                   ? "navDashboard"
                   : tab.id === "savings"
                     ? "navSavings"
                     : tab.id === "loans"
                       ? "navLoans"
                       : "navSettings"
               ),
              }))}
              activeTabId={routeName}
              onTabPress={(tabId) => {
                const index = state.routes.findIndex((r) => r.name === tabId);
                if (index !== -1) {
                  router.push(`/(budget)/${tabId === "index" ? "" : tabId}`);
                }
              }}
            />
          );
        }}
      >
        <Tabs.Screen name="index" options={{ title: t("navDashboard") }} />
        <Tabs.Screen name="savings" options={{ title: t("navSavings") }} />
        <Tabs.Screen name="loans" options={{ title: t("navLoans") }} />
        <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
        <Tabs.Screen name="budget" options={{ href: null }} getId={({ params }) => params?.month ?? "current"} />
      </Tabs>
    </>
  );
}
