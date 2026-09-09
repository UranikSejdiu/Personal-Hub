import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Rocket } from "lucide-react-native";
import { useRouter, type Href } from "expo-router";
import { AppSwitcher } from "./AppSwitcher";
import { HUB_APPS, getHubRoute } from "../hub/registry";
import { useUpdate } from "../lib/UpdateContext";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";

interface HubHeaderProps {
  activeAppId: string;
  onAppSelect: (appId: string) => void;
}

export function HubHeader({ activeAppId, onAppSelect }: HubHeaderProps) {
  const insets = useSafeAreaInsets();
  const { hasUpdate } = useUpdate();
  const colors = useThemeColors();
  const { t } = useI18n();
  const router = useRouter();

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
          <Pressable
            onPress={() => router.push(`${getHubRoute(activeAppId)}/settings` as Href)}
            accessibilityRole="button"
            accessibilityLabel={t("newUpdateAvailable")}
            className="relative h-10 w-10 items-center justify-center rounded-full bg-primary/10"
          >
            <Rocket size={20} color={colors.primary} />
            <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-destructive" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
