import { Stack, useGlobalSearchParams, useRouter, useSegments } from "expo-router";
import { HubHeader } from "../../src/components/HubHeader";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";
import { PillNav } from "../../src/components/PillNav";
import { NOTES_TABS } from "../../src/hub/tabs";
import { useI18n } from "../../src/lib/i18n";

export default function NotesLayout() {
  const { handleAppSelect } = useAppSwitching("notes");
  const { t } = useI18n();
  const router = useRouter();
  const segments = useSegments();
  const { returnTab } = useGlobalSearchParams<{ returnTab?: string }>();
  const isEditor = segments.at(-1) === "editor" || segments.at(-1) === "checklist";
  const destinations = { index: "/(notes)", archive: "/(notes)/archive", settings: "/(notes)/settings" } as const;

  return (
    <>
      <HubHeader activeAppId="notes" onAppSelect={handleAppSelect} />
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName="(tabs)"
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editor" />
        <Stack.Screen name="checklist" />
      </Stack>
      {isEditor && <PillNav tabs={NOTES_TABS.map(tab => ({ ...tab, label: t(tab.labelKey) }))}
        activeTabId={returnTab === "archive" ? "archive" : "index"}
        onTabPress={tabId => {
          if (tabId in destinations) router.replace(destinations[tabId as keyof typeof destinations]);
        }} />}
    </>
  );
}
