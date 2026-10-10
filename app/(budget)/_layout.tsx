import { useEffect, useRef } from "react";
import { Tabs, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { PillNav } from "../../src/components/PillNav";
import { BUDGET_TABS } from "../../src/hub/tabs";
import { HubHeader } from "../../src/components/HubHeader";
import { useI18n } from "../../src/lib/i18n";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";
import { usePersistActiveTab } from "../../src/hooks/usePersistActiveTab";
import { loadSavingsGoal, loadBudget, currentMonth } from "../../src/lib/budget";
import { ensureMonthlyAutoDeposit } from "../../src/lib/savings";

export default function BudgetLayout() {
  const router = useRouter();
  const { t } = useI18n();
  const { handleAppSelect } = useAppSwitching("budget");
  usePersistActiveTab("budget");

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    void Promise.all([loadSavingsGoal(), loadBudget(currentMonth())])
      .then(([sg, budget]) => {
        const target = budget?.savings_goal ?? sg.goal_amount;
        if (target > 0) {
          return ensureMonthlyAutoDeposit(target);
        }
      })
      .catch(() => {
        toast.error(tRef.current("errorLoadingData"));
      });
  }, []);

  return (
    <>
      <HubHeader activeAppId="budget" onAppSelect={handleAppSelect} />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state }) => {
          const routeName = state.routes[state.index].name;
          const isSubScreen = !BUDGET_TABS.some((tab) => tab.id === routeName);
          if (isSubScreen) return null;
          return (
            <PillNav
              tabs={BUDGET_TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))}
              activeTabId={routeName}
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
        <Tabs.Screen name="index" options={{ title: t("navDashboard") }} />
        <Tabs.Screen name="savings" options={{ title: t("navSavings") }} />
        <Tabs.Screen name="loans" options={{ title: t("navLoans") }} />
        <Tabs.Screen name="settings" options={{ title: t("navSettings") }} />
        <Tabs.Screen
          name="budget"
          options={{ href: null }}
          dangerouslySingular={(_name, params) => {
            const month = params.month;
            return (typeof month === "string" ? month : month?.[0]) ?? "current";
          }}
        />
      </Tabs>
    </>
  );
}
