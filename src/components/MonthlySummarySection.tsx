import { useMemo } from "react";
import { View, Text } from "react-native";
import { CircleCheck } from "lucide-react-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { pmt } from "../lib/calculations";
import { formatCurrency, type Budget, type Expense, type Loans } from "../lib/budget";
import { NumberInput } from "./NumberInput";

interface Props {
  budget: Budget;
  expenses: Expense[];
  loans: Loans;
  savingsGoal: number;
  onIncomeChange: (income: number) => void;
}

export function MonthlySummarySection({
  budget,
  expenses,
  loans,
  savingsGoal,
  onIncomeChange,
}: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();

  const c = useMemo(() => {
    const loanPayment =
      loans.loan_amount <= 0 || loans.loan_term <= 0
        ? 0
        : loans.loan_payment > 0
          ? loans.loan_payment
          : pmt(loans.loan_amount, loans.loan_rate, loans.loan_term);
    const ccPayment = loans.cc_payment || 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalOutflow = loanPayment + ccPayment + totalExpenses + savingsGoal;
    const remaining = (budget.income || 0) - totalOutflow;

    const paidLoan = budget.loan_paid ? loanPayment : 0;
    const paidCc = budget.cc_paid ? ccPayment : 0;
    const paidExpenses = expenses.reduce((sum, e) => sum + (e.paid ? e.amount || 0 : 0), 0);
    const actualOutflow = paidLoan + paidCc + paidExpenses;
    const actualRemaining = (budget.income || 0) - actualOutflow;

    const basePlanned = Math.max(budget.income || 0, totalOutflow);
    const loanPct = basePlanned > 0 ? (loanPayment / basePlanned) * 100 : 0;
    const ccPct = basePlanned > 0 ? (ccPayment / basePlanned) * 100 : 0;
    const expPct = basePlanned > 0 ? (totalExpenses / basePlanned) * 100 : 0;
    const savPct = basePlanned > 0 ? (savingsGoal / basePlanned) * 100 : 0;
    const remPct = basePlanned > 0 && remaining > 0 ? (remaining / basePlanned) * 100 : 0;

    return {
      loanPayment, ccPayment, totalExpenses, totalOutflow, remaining,
      paidLoan, paidCc, paidExpenses, actualOutflow, actualRemaining,
      basePlanned, loanPct, ccPct, expPct, savPct, remPct,
    };
  }, [budget, expenses, loans, savingsGoal]);

  const goalProgress =
    savingsGoal > 0 ? Math.min(100, Math.max(0, (c.actualRemaining / savingsGoal) * 100)) : 0;
  const goalMet = savingsGoal > 0 && c.actualRemaining >= savingsGoal;

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <Text className="mb-3 text-base font-semibold text-foreground">{t("sectionSummary")}</Text>

      <View className="mb-3 gap-1.5">
        <Text className="text-sm text-muted-foreground">{t("monthlyIncome")}</Text>
        <NumberInput value={budget.income} onChange={onIncomeChange} min={0} placeholder="0.00" />
      </View>

      {c.basePlanned > 0 && (
        <View className="mb-3 rounded-lg bg-muted/60 p-3">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("spendingBreakdown")}
          </Text>

          <View className="mb-2 h-2.5 w-full flex-row overflow-hidden rounded-full bg-border">
            {c.loanPct > 0 && <View style={{ width: `${c.loanPct}%` }} className="bg-chart-1" />}
            {c.ccPct > 0 && <View style={{ width: `${c.ccPct}%` }} className="bg-chart-2" />}
            {c.expPct > 0 && <View style={{ width: `${c.expPct}%` }} className="bg-chart-3" />}
            {c.savPct > 0 && <View style={{ width: `${c.savPct}%` }} className="bg-chart-4" />}
            {c.remPct > 0 && <View style={{ width: `${c.remPct}%` }} className="bg-chart-5" />}
          </View>

          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            {c.loanPayment > 0 && (
              <View className="flex-row items-center gap-1">
                <View className="h-2 w-2 rounded-full bg-chart-1" />
                <Text className="text-[11px] text-muted-foreground">{t("loanPaymentLabel")} ({c.loanPct.toFixed(0)}%)</Text>
              </View>
            )}
            {c.ccPayment > 0 && (
              <View className="flex-row items-center gap-1">
                <View className="h-2 w-2 rounded-full bg-chart-2" />
                <Text className="text-[11px] text-muted-foreground">{t("ccPaymentLabel")} ({c.ccPct.toFixed(0)}%)</Text>
              </View>
            )}
            {c.totalExpenses > 0 && (
              <View className="flex-row items-center gap-1">
                <View className="h-2 w-2 rounded-full bg-chart-3" />
                <Text className="text-[11px] text-muted-foreground">{t("totalCustomExpenses")} ({c.expPct.toFixed(0)}%)</Text>
              </View>
            )}
            {savingsGoal > 0 && (
              <View className="flex-row items-center gap-1">
                <View className="h-2 w-2 rounded-full bg-chart-4" />
                <Text className="text-[11px] text-muted-foreground">{t("savingsGoalLabel")} ({c.savPct.toFixed(0)}%)</Text>
              </View>
            )}
            {c.remaining > 0 && (
              <View className="flex-row items-center gap-1">
                <View className="h-2 w-2 rounded-full bg-chart-5" />
                <Text className="text-[11px] text-muted-foreground">{t("remainingSavings")} ({c.remPct.toFixed(0)}%)</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View className="gap-1 rounded-lg bg-muted p-3">
        <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("planned")}</Text>
        <View className="flex-row justify-between">
          <Text className="text-sm font-medium text-chart-1/75">{t("loanPaymentLabel")}</Text>
           <Text className="text-sm font-medium text-chart-1/75">{formatCurrency(c.loanPayment)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm font-medium text-chart-2/75">{t("ccPaymentLabel")}</Text>
           <Text className="text-sm font-medium text-chart-2/75">{formatCurrency(c.ccPayment)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm font-medium text-chart-3/75">{t("totalCustomExpenses")}</Text>
           <Text className="text-sm font-medium text-chart-3/75">{formatCurrency(c.totalExpenses)}</Text>
        </View>
        {savingsGoal > 0 && (
          <View className="flex-row justify-between">
            <Text className="text-sm font-medium text-chart-4/75">{t("savingsGoalLabel")}</Text>
             <Text className="text-sm font-medium text-chart-4/75">-{formatCurrency(savingsGoal)}</Text>
          </View>
        )}

        <View className="my-1 border-t border-border" />

        <View className="flex-row justify-between">
          <Text className="text-sm font-medium text-foreground">{t("totalMonthlyOutflow")}</Text>
          <Text className="text-sm font-medium text-foreground">{formatCurrency(c.totalOutflow)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className={`text-sm font-semibold ${c.remaining >= 0 ? "text-success" : "text-destructive"}`}>
            {t("remainingSavings")}
          </Text>
          <Text className={`text-sm font-semibold ${c.remaining >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(c.remaining)}
          </Text>
        </View>
        {c.remaining < 0 && (
          <View className="mt-1 rounded-lg bg-destructive/15 p-2">
            <Text className="text-xs font-medium text-destructive">{t("deficitPlanned", { amount: formatCurrency(Math.abs(c.remaining)) })}</Text>
          </View>
        )}

        <View className="my-1 border-t border-border" />

        <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("actualPaid")}</Text>
        <View className="flex-row justify-between">
          <Text className={`text-sm ${budget.loan_paid ? "font-semibold text-chart-1" : "font-medium text-foreground"}`}>{t("loanPaymentLabel")}</Text>
          <Text className={`text-sm ${budget.loan_paid ? "font-semibold text-chart-1" : "font-medium text-foreground"}`}>
            {formatCurrency(c.paidLoan)}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className={`text-sm ${budget.cc_paid ? "font-semibold text-chart-2" : "font-medium text-foreground"}`}>{t("ccPaymentLabel")}</Text>
          <Text className={`text-sm ${budget.cc_paid ? "font-semibold text-chart-2" : "font-medium text-foreground"}`}>
            {formatCurrency(c.paidCc)}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className={`text-sm ${c.paidExpenses > 0 ? "font-semibold text-chart-3" : "font-medium text-foreground"}`}>{t("paidExpenses")}</Text>
          <Text className={`text-sm ${c.paidExpenses > 0 ? "font-semibold text-chart-3" : "font-medium text-foreground"}`}>
            {formatCurrency(c.paidExpenses)}
          </Text>
        </View>

        <View className="my-1 border-t border-border" />

        <View className="flex-row justify-between">
          <Text className="text-sm font-medium text-foreground">{t("totalPaidOutflow")}</Text>
          <Text className="text-sm font-medium text-foreground">{formatCurrency(c.actualOutflow)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className={`text-sm font-semibold ${c.actualRemaining >= 0 ? "text-success" : "text-destructive"}`}>
            {t("actualRemaining")}
          </Text>
          <Text className={`text-sm font-semibold ${c.actualRemaining >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(c.actualRemaining)}
          </Text>
        </View>
        {c.actualRemaining < 0 && (
          <View className="mt-1 rounded-lg bg-destructive/15 p-2">
            <Text className="text-xs font-medium text-destructive">{t("deficitActual", { amount: formatCurrency(Math.abs(c.actualRemaining)) })}</Text>
          </View>
        )}
      </View>

      {savingsGoal > 0 && (
        <View className="mt-3 rounded-lg bg-muted/60 p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("savingsGoalLabel")}</Text>
            {goalMet && (
              <View className="flex-row items-center gap-1 rounded-full bg-success/15 px-2 py-0.5">
                 <CircleCheck size={12} color={colors.success} />
                <Text className="text-[11px] font-semibold text-success">{t("goalMetBadge")}</Text>
              </View>
            )}
          </View>

          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">{t("goalColon")}</Text>
            <Text className="text-sm font-medium text-foreground">{formatCurrency(savingsGoal)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">{t("actualRemaining")}</Text>
            <Text className={`text-sm font-medium ${goalMet ? "text-success" : "text-foreground"}`}>
              {formatCurrency(c.actualRemaining)}
            </Text>
          </View>

          <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
            <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${goalProgress}%` }} />
          </View>
        </View>
      )}
    </View>
  );
}
