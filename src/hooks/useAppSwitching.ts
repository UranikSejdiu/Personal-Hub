import { useCallback } from "react";
import { useRouter, type Href } from "expo-router";
import { getHubRoute } from "../hub/registry";
import { hubTabs } from "../hub/tabs";
import { getAppTab } from "../lib/appTabs";

export function useAppSwitching(currentAppId: string) {
  const router = useRouter();

  const handleAppSelect = useCallback(
    (appId: string) => {
      if (appId === currentAppId) return;
      const base = getHubRoute(appId);
      const tabs = hubTabs(appId);
      const fallback = tabs[0]?.id ?? "index";
      void getAppTab(appId)
        .then((remembered) => {
          const tabId = remembered && tabs.some((tab) => tab.id === remembered) ? remembered : fallback;
          router.replace((tabId === "index" ? base : `${base}/${tabId}`) as Href);
        })
        .catch(() => {
          router.replace((fallback === "index" ? base : `${base}/${fallback}`) as Href);
        });
    },
    [currentAppId, router]
  );

  return { handleAppSelect };
}
