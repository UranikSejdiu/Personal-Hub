import { Text } from "../ui/Typography";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  useReducedMotion,
} from "react-native-reanimated";
import { AppSwitcher } from "../AppSwitcher";
import { PillNav } from "../PillNav";
import { HUB_APPS } from "../../hub/registry";
import { hubTabs } from "../../hub/tabs";
import { useI18n } from "../../lib/i18n";

/**
 * Teaches the two levels of navigation using the real controls: the switcher
 * dropdown at the top of every screen, and the tab bar at the bottom. Both are
 * live, so a newcomer can open the switcher and tap around exactly as they
 * would in the app.
 */
export function NavigationPreview({ active = true }: { active?: boolean } = {}) {
  const reduceMotion = useReducedMotion();
  const { t } = useI18n();
  const [activeAppId, setActiveAppId] = useState<string>(HUB_APPS[0].id);
  const [lastTabs, setLastTabs] = useState<Record<string, string>>({});
  const activeTabId = lastTabs[activeAppId] ?? hubTabs(activeAppId)[0].id;

  const hintPulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !active) {
      hintPulse.value = 1;
      return;
    }
    hintPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    return () => cancelAnimation(hintPulse);
  }, [active, reduceMotion, hintPulse]);
  const hintStyle = useAnimatedStyle(() => ({ opacity: 0.45 + hintPulse.value * 0.55 }));

  const tabs = hubTabs(activeAppId);
  const activeApp = HUB_APPS.find((app) => app.id === activeAppId) ?? HUB_APPS[0];
  const activeLabel = tabs.find((tab) => tab.id === activeTabId)?.labelKey ?? tabs[0].labelKey;

  return (
    <View className="w-full items-center gap-3">
      <Animated.Text
        style={hintStyle}
        className="text-xs font-medium text-muted-foreground"
        accessibilityRole="text"
      >
        {t("tutorialHintSwitcher")}
      </Animated.Text>

      <View className="w-full overflow-hidden rounded-2xl border border-border bg-background">
        <View className="flex-row items-center bg-background px-2 py-2">
          <AppSwitcher
            apps={HUB_APPS}
            activeAppId={activeAppId}
            onAppSelect={(appId) => {
              setActiveAppId(appId);
            }}
          />
        </View>

        <View className="items-center px-4 py-8">
          <View className="w-full items-center gap-2 rounded-xl border border-border/50 bg-card px-4 py-6">
            <Text className="text-center text-base font-semibold text-foreground">
              {t(activeLabel)}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {t("tutorialHintPreviewBody", { app: t(activeApp.titleKey) })}
            </Text>
          </View>
        </View>
      </View>

      <Animated.Text
        style={hintStyle}
        className="text-xs font-medium text-muted-foreground"
        accessibilityRole="text"
      >
        {t("tutorialHintTabs")}
      </Animated.Text>

      <View className="w-full">
        <PillNav
          placement="inline"
          tabs={tabs.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
          activeTabId={activeTabId}
          onTabPress={(tabId) => setLastTabs((previous) => ({ ...previous, [activeAppId]: tabId }))}
        />
      </View>
    </View>
  );
}
