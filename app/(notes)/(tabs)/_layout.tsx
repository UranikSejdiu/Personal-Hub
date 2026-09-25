import { Tabs, useRouter } from "expo-router";
import { PillNav, type PillNavTab } from "../../../src/components/PillNav";
import { useI18n } from "../../../src/lib/i18n";

const NOTES_TABS: PillNavTab[] = [
  { id: "index", label: "Notes", icon: "note-text" },
  { id: "settings", label: "Settings", icon: "cog" },
];

export default function NotesTabsLayout() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state }) => {
        const routeName = state.routes[state.index].name;
        return (
          <PillNav
            tabs={NOTES_TABS.map((tab) => ({
              ...tab,
              label: t(
                tab.id === "index" ? "navNotes" : "navSettings"
              ),
            }))}
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
      <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
    </Tabs>
  );
}
