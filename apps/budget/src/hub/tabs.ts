import { Calculator, LayoutDashboard, PiggyBank, Settings } from "../components/AppIcons";
import type { NavigationDestination } from "../components/NavigationBar";

export const BUDGET_TABS: readonly NavigationDestination[] = [
  { id: "index", label: "Months", icon: LayoutDashboard },
  { id: "savings", label: "Savings", icon: PiggyBank },
  { id: "loans", label: "Payments", icon: Calculator },
  { id: "settings", label: "Settings", icon: Settings },
];
