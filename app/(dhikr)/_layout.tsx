import { Tabs, useRouter } from "expo-router";
import { PillNav } from "../../src/components/PillNav";
import { DHIKR_TABS } from "../../src/hub/tabs";
import { HubHeader } from "../../src/components/HubHeader";
import { useI18n } from "../../src/lib/i18n";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";
import { usePersistActiveTab } from "../../src/hooks/usePersistActiveTab";

export default function DhikrLayout() {
  const router = useRouter();
  const { t } = useI18n();
  const { handleAppSelect } = useAppSwitching("dhikr");
  usePersistActiveTab("dhikr");

  return (
    <>
      <HubHeader activeAppId="dhikr" onAppSelect={handleAppSelect} />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state }) => (
          <PillNav
            tabs={DHIKR_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
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
