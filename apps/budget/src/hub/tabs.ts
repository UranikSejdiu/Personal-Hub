import type { TKey } from "../lib/i18n";

/** MoneyPlan's bottom navigation. */
export interface HubTabDef {
  id: string;
  labelKey: TKey;
  icon: string;
}

export const BUDGET_TABS: HubTabDef[] = [
  { id: "index", labelKey: "navDashboard", icon: "view-dashboard" },
  { id: "savings", labelKey: "navSavings", icon: "piggy-bank" },
  { id: "loans", labelKey: "navLoans", icon: "calculator" },
  { id: "settings", labelKey: "navSettings", icon: "cog" },
];
