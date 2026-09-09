import { useCallback } from "react";
import { useRouter, type Href } from "expo-router";
import { getHubRoute } from "../hub/registry";

export function useAppSwitching(currentAppId: string) {
  const router = useRouter();

  const handleAppSelect = useCallback(
    (appId: string) => {
      if (appId === currentAppId) return;
      router.replace(getHubRoute(appId) as Href);
    },
    [currentAppId, router]
  );

  return { handleAppSelect };
}
