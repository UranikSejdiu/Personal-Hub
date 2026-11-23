/** MoneyPlan's bottom navigation. */
export interface HubTabDef {
  id: string;
  label: string;
  icon: string;
}

export const BUDGET_TABS: HubTabDef[] = [
  { id: "index", label: "Months", icon: "view-dashboard" },
  { id: "savings", label: "Savings", icon: "piggy-bank" },
  { id: "loans", label: "Payments", icon: "calculator" },
  { id: "settings", label: "Settings", icon: "cog" },
];
