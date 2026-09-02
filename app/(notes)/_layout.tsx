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
        tabBar={({ state }) => {
          const routeName = state.routes[state.index].name;
          const isSubScreen = !NOTES_TABS.some((tab) => tab.id === routeName);
          if (isSubScreen) return null;
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
        <Tabs.Screen name="editor" options={{ href: null }} />
      </Tabs>
    </>
  );
}
