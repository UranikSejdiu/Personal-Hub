import { Tabs } from "expo-router";
import { PillNav } from "../../../src/components/PillNav";
import { NOTES_TABS } from "../../../src/hub/tabs";
import { useI18n } from "../../../src/lib/i18n";
import { useThemeColors } from "../../../src/lib/theme";

export default function NotesTabsLayout() {
  const { t } = useI18n();
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={({ state, emitter, navigateToTab }) => {
        const routeName = state.routes[state.index].name;
        return (
            <PillNav
              tabs={NOTES_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
              activeTabId={routeName}
            onTabPress={(tabId) => {
              const index = state.routes.findIndex((r) => r.name === tabId);
              if (index !== -1) {
                const route = state.routes[index];
                const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!event.defaultPrevented && state.index !== index) navigateToTab(route.key);
              }
            }}
          />
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("navNotes") }} />
      <Tabs.Screen name="archive" options={{ title: t("notesArchiveTitle") }} />
    </Tabs>
  );
}
