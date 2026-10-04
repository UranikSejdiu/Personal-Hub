import { Tabs, useRouter } from "expo-router";
import { PillNav } from "../../src/components/PillNav";
import { HubHeader } from "../../src/components/HubHeader";
import { TASKS_TABS } from "../../src/hub/tabs";
import { useI18n } from "../../src/lib/i18n";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";
import { usePersistActiveTab } from "../../src/hooks/usePersistActiveTab";

export default function TasksLayout() {
  const { t } = useI18n();
  const router = useRouter();
  const { handleAppSelect } = useAppSwitching("tasks");
  usePersistActiveTab("tasks");
  return <>
    <HubHeader activeAppId="tasks" onAppSelect={handleAppSelect} />
    <Tabs screenOptions={{ headerShown: false }} tabBar={({ state }) => <PillNav
      tabs={TASKS_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))} activeTabId={state.routes[state.index].name}
      onTabPress={(id) => {
        if (id === "index") router.push("/(tasks)");
        else if (id === "all") router.push("/(tasks)/all");
        else if (id === "settings") router.push("/(tasks)/settings");
      }} /> }>
      <Tabs.Screen name="index" options={{ title: t("tasksToday") }} />
      <Tabs.Screen name="all" options={{ title: t("tasksAll") }} />
      <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
    </Tabs>
  </>;
}
