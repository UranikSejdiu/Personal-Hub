import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { HubHeader } from "../../src/components/HubHeader";
import SettingsScreen from "../../src/components/SettingsScreen";
import type { SettingsSection } from "../../src/components/SettingsMenu";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";
import { HUB_APPS } from "../../src/hub/registry";

function isSettingsSection(value: unknown): value is SettingsSection {
  return value === "budget" || value === "backup" || value === "about" || value === "modules";
}

export default function SettingsDetailRoute() {
  const { section, from } = useLocalSearchParams<{ section?: string; from?: string }>();
  const activeAppId = HUB_APPS.find((app) => app.id === from)?.id ?? "budget";
  const { handleAppSelect } = useAppSwitching(activeAppId);

  if (!isSettingsSection(section)) {
    return <Redirect href="/(budget)/settings" />;
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: section !== "budget" }} />
      <HubHeader activeAppId={activeAppId} onAppSelect={handleAppSelect} />
      <SettingsScreen activeAppId={activeAppId} section={section} />
    </>
  );
}
