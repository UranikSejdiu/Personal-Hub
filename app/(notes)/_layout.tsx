import { Tabs, useRouter } from "expo-router";
import { PillNav, type PillNavTab } from "../../src/components/PillNav";
import { HubHeader } from "../../src/components/HubHeader";
import { useI18n } from "../../src/lib/i18n";

const NOTES_TABS: PillNavTab[] = [
  { id: "index", label: "Shënimet", icon: "note-text" },
  { id: "settings", label: "Konfigurimet", icon: "cog" },
];

export default function NotesLayout() {
  const router = useRouter();
  const { t } = useI18n();

  const handleAppSelect = (appId: string) => {
    if (appId === "notes") return;
    if (appId === "budget") router.replace("/(budget)" as any);
    else if (appId === "dhikr") router.replace("/(dhikr)" as any);
    else router.replace("/(notes)" as any);
  };

  return (
    <>
      <HubHeader activeAppId="notes" onAppSelect={handleAppSelect} />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state }) => (
          <PillNav
            tabs={NOTES_TABS.map((tab) => ({
              ...tab,
              label: t(
                tab.id === "index" ? "navNotes" : "navSettings"
              ),
            }))}
            activeTabId={state.routes[state.index].name}
            onTabPress={(tabId) => {
              const index = state.routes.findIndex((r) => r.name === tabId);
              if (index !== -1) {
                router.push(`/(notes)/${tabId === "index" ? "" : tabId}`);
              }
            }}
          />
        )}
      >
        <Tabs.Screen name="index" options={{ title: "Notes" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    </>
  );
}
