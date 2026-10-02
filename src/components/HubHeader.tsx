import { View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Rocket } from "./AppIcons";
import { useRouter } from "expo-router";
import { AppSwitcher } from "./AppSwitcher";
import { HUB_APPS } from "../hub/registry";
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
      className="bg-background"
      style={{ paddingTop: insets.top }}
    >
      <View className="w-full max-w-md self-center flex-row items-center justify-between px-4 py-2">
        <AppSwitcher
          apps={HUB_APPS}
          activeAppId={activeAppId}
          onAppSelect={onAppSelect}
        />
        {hasUpdate ? (
          <Pressable
            onPress={() => router.push({ pathname: "/settings/[section]", params: { section: "about", from: activeAppId } })}
            accessibilityRole="button"
            accessibilityLabel={t("newUpdateAvailable")}
            className="relative h-11 w-11 items-center justify-center rounded-full bg-primary/10 active:opacity-70"
            accessible
          >
            <Rocket size={20} color={colors.primary} />
            <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-destructive" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
