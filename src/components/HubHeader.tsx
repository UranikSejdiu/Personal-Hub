import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppSwitcher, type AppInfo } from "./AppSwitcher";
import { useUpdate } from "../lib/UpdateContext";

const HUB_APPS: AppInfo[] = [
  { id: "budget", titleKey: "appBudget", icon: "wallet" },
  { id: "dhikr", titleKey: "appDhikr", icon: "star-four-points" },
  { id: "notes", titleKey: "appNotes", icon: "note-text" },
];

interface HubHeaderProps {
  activeAppId: string;
  onAppSelect: (appId: string) => void;
}

export function HubHeader({ activeAppId, onAppSelect }: HubHeaderProps) {
  const insets = useSafeAreaInsets();
  const { hasUpdate } = useUpdate();

  return (
    <View
      className="bg-card border-b border-border/50"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-2">
        <AppSwitcher
          apps={HUB_APPS}
          activeAppId={activeAppId}
          onAppSelect={onAppSelect}
        />
        {hasUpdate ? (
          <View className="relative h-8 w-8 items-center justify-center">
            <View className="h-2.5 w-2.5 rounded-full bg-destructive" />
          </View>
        ) : null}
      </View>
    </View>
  );
}
