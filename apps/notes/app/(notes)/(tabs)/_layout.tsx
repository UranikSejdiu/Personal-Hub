import { Tabs } from "expo-router";
import { Easing, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { PillNav } from "../../../src/components/PillNav";
import { NOTES_TABS } from "../../../src/hub/tabs";
import { useI18n } from "../../../src/lib/i18n";
import { useThemeColors } from "../../../src/lib/theme";

export default function NotesTabsLayout() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();

  return (
    <Tabs
      screenOptions={({ navigation }) => {
        const focused = navigation.isFocused();
        return {
          headerShown: false,
          animation: reducedMotion ? "none" : "shift",
          transitionSpec: {
            animation: "timing",
            config: { duration: reducedMotion ? 0 : 320, easing: Easing.bezier(0.2, 0, 0, 1) },
          },
          sceneStyle: { backgroundColor: colors.background },
          // The focused scene sits above the outgoing scene in the tab renderer.
          // Slide it over a gently receding page, without cross-fading either one.
          sceneStyleInterpolator: reducedMotion ? undefined : ({ current }) => ({
            sceneStyle: {
              overflow: "hidden",
              borderRadius: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [24, 0, 24],
                extrapolate: "clamp",
              }),
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: focused ? [-width, 0, width] : [-width * 0.16, 0, width * 0.16],
                    extrapolate: "clamp",
                  }),
                },
                {
                  scale: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: focused ? [0.98, 1, 0.98] : [0.96, 1, 0.96],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          }),
        };
      }}
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
