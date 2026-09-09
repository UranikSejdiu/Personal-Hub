import { Tabs, useRouter } from "expo-router";
import { PillNav, type PillNavTab } from "../../src/components/PillNav";
import { HubHeader } from "../../src/components/HubHeader";
import { useI18n } from "../../src/lib/i18n";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";

const DHIKR_TABS: PillNavTab[] = [
  { id: "index", label: "Numëruesi", icon: "star-four-points" },
  { id: "list", label: "Dhikret", icon: "format-list-numbered" },
  { id: "settings", label: "Konfigurimet", icon: "cog" },
];

export default function DhikrLayout() {
  const router = useRouter();
  const { t } = useI18n();
  const { handleAppSelect } = useAppSwitching("dhikr");

  return (
    <>
      <HubHeader activeAppId="dhikr" onAppSelect={handleAppSelect} />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state }) => (
          <PillNav
            tabs={DHIKR_TABS.map((tab) => ({
              ...tab,
              label: t(
                tab.id === "index"
                  ? "navCounter"
                  : tab.id === "list"
                    ? "navDhikrList"
                    : "navSettings"
              ),
            }))}
            activeTabId={state.routes[state.index].name}
            onTabPress={(tabId) => {
              const index = state.routes.findIndex((r) => r.name === tabId);
              if (index !== -1) {
                router.push(`/(dhikr)/${tabId === "index" ? "" : tabId}`);
              }
            }}
          />
        )}
      >
        <Tabs.Screen name="index" options={{ title: t("navCounter") }} />
        <Tabs.Screen name="list" options={{ title: t("navDhikrList") }} />
        <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
      </Tabs>
    </>
  );
}
