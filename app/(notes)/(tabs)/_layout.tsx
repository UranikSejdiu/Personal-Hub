import { Tabs, useRouter } from "expo-router";
import { PillNav } from "../../../src/components/PillNav";
import { NOTES_TABS } from "../../../src/hub/tabs";
import { useI18n } from "../../../src/lib/i18n";
import { usePersistActiveTab } from "../../../src/hooks/usePersistActiveTab";

export default function NotesTabsLayout() {
  const router = useRouter();
  const { t } = useI18n();
  usePersistActiveTab("notes");

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state }) => {
        const routeName = state.routes[state.index].name;
        return (
            <PillNav
              tabs={NOTES_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
              activeTabId={routeName}
            onTabPress={(tabId) => {
              const index = state.routes.findIndex((r) => r.name === tabId);
              if (index !== -1) {
                router.push(`/(notes)/${tabId === "index" ? "" : tabId}`);
              }
            }}
          />
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("navNotes") }} />
      <Tabs.Screen name="archive" options={{ title: t("notesArchiveTitle") }} />
      <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
    </Tabs>
  );
}
