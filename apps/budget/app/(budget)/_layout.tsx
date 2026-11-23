import { useEffect } from "react";
import { Easing } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Tabs, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { NavigationBar } from "../../src/components/NavigationBar";
import { BUDGET_TABS } from "../../src/hub/tabs";
import { HubHeader } from "../../src/components/HubHeader";
import { loadSavingsGoal, loadBudget, currentMonth } from "../../src/lib/budget";
import { ensureMonthlyAutoDeposit } from "../../src/lib/savings";
import { useThemeColors } from "../../src/lib/theme";

export default function BudgetLayout() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const colors = useThemeColors();


  useEffect(() => {
    void Promise.all([loadSavingsGoal(), loadBudget(currentMonth())])
      .then(([sg, budget]) => {
        const target = budget?.savings_goal ?? sg.goal_amount;
        if (target > 0) {
          return ensureMonthlyAutoDeposit(target);
        }
      })
      .catch(() => {
        toast.error("Failed to load data.");
      });
  }, []);

  return (
    <>
      <HubHeader />
      <Tabs
        screenOptions={() => ({
          headerShown: false,
          animation: reducedMotion ? "none" : "shift",
          transitionSpec: {
            animation: "timing",
            config: { duration: reducedMotion ? 0 : 200, easing: Easing.bezier(0.2, 0, 0, 1) },
          },
          sceneStyle: { backgroundColor: colors.background },
          // Keep the same short path when focus changes or a transition reverses.
          // Opacity and translation run on the navigator's native animation driver.
          sceneStyleInterpolator: reducedMotion ? undefined : ({ current }) => ({
            sceneStyle: {
              opacity: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [0, 1, 0],
                extrapolate: "clamp",
              }),
              transform: [{
                translateX: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-16, 0, 16],
                  extrapolate: "clamp",
                }),
              }],
            },
          }),
        })}
        tabBar={({ state }) => {
          const routeName = state.routes[state.index].name;
          const activeTabId = routeName === "budget" ? "index" : routeName;
          const isSubScreen = !BUDGET_TABS.some((tab) => tab.id === activeTabId);
          if (isSubScreen) return null;
          return (
            <NavigationBar
              tabs={BUDGET_TABS}
              activeTabId={activeTabId}
              onTabPress={(tabId) => {
                const index = state.routes.findIndex((r) => r.name === tabId);
                if (index !== -1) {
                  router.push(`/(budget)/${tabId === "index" ? "" : tabId}`);
                }
              }}
            />
          );
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Months" }} />
        <Tabs.Screen name="savings" options={{ title: "Savings" }} />
        <Tabs.Screen name="loans" options={{ title: "Payments" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
        <Tabs.Screen
          name="budget"
          // Month details keep Months selected in the navigation bar.
          dangerouslySingular={(_name, params) => {
            const month = params.month;
            return (typeof month === "string" ? month : month?.[0]) ?? "current";
          }}
        />
      </Tabs>
    </>
  );
}
