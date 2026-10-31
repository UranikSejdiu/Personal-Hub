import { useEffect } from "react";
import { useSegments } from "expo-router";
import { hubTabs } from "../hub/tabs";
import { setAppTab } from "../lib/appTabs";

/**
 * Records the module's active tab whenever the route changes, so the app
 * switcher can reopen each module where the user left it. Works regardless of
 * how the tab was reached (tab bar, back, deep link) because it derives the
 * active tab from the navigation segments rather than the tab-bar callback.
 */
export function usePersistActiveTab(appId: string): void {
  const segments = useSegments();

  useEffect(() => {
    const tabs = hubTabs(appId);
    const active = tabs.find((tab) => (segments as string[]).includes(tab.id));
    void setAppTab(appId, active?.id ?? tabs[0]?.id ?? "index");
  }, [segments, appId]);
}
