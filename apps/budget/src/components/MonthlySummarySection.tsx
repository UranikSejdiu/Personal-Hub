import { Text } from "./ui/Typography";
import { useMemo, useState } from "react";
import { View, Pressable } from "react-native";
import { CircleCheck, ChevronDown } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import {
  loanPaymentForMonth,
  type Budget,
  type Expense,
  type Loans,
} from "../lib/budget";
import { formatCurrency } from "../lib/utils";
import { CREDIT_CARD_SLOTS, creditCardDetails, creditCardPaymentForMonth } from "../lib/creditCards";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
import { repaymentForMonth, type RepaymentPlan } from "../lib/repaymentPlans";

interface Props {
  budget: Budget;
  expenses: Expense[];
  loans: Loans;
  savingsGoal: number;
  repayments: readonly RepaymentPlan[];
  paidRepayments: ReadonlySet<number>;
}

export function MonthlySummarySection({
  budget,
  expenses,
  loans,
  savingsGoal,
  repayments,
  paidRepayments,
}: Props) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const c = useMemo(() => {
    const loanPayment = loanPaymentForMonth(loans, budget.month);
    const cards = CREDIT_CARD_SLOTS.map((slot) => {
      const card = creditCardDetails(loans, slot);
      const payment = creditCardPaymentForMonth(card, budget.month);
      const paid = slot === 1 ? budget.cc_paid : budget.cc2_paid;
      return { slot, card, payment, paid, actual: paid ? payment : 0 };
    });
    const ccPayment = cards.reduce((sum, card) => sum + card.payment, 0);
    const extra = repayments.map((plan) => ({ plan, payment: repaymentForMonth(plan, budget.month), paid: paidRepayments.has(plan.id) })).filter((item) => item.payment > 0);
    const extraPlanned = extra.reduce((sum, item) => sum + item.payment, 0);
    const extraPaid = extra.reduce((sum, item) => sum + (item.paid ? item.payment : 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalOutflow = loanPayment + ccPayment + extraPlanned + totalExpenses + savingsGoal;
    const remaining = (budget.income || 0) - totalOutflow;

    const paidLoan = budget.loan_paid ? loanPayment : 0;
    const paidCc = cards.reduce((sum, card) => sum + card.actual, 0);
    const paidExpenses = expenses.reduce((sum, e) => sum + (e.paid ? e.amount || 0 : 0), 0);
    const actualOutflow = paidLoan + paidCc + extraPaid + paidExpenses;
    const actualRemaining = (budget.income || 0) - actualOutflow;

    return {
      cards, extra, extraPlanned, loanPayment, ccPayment, totalExpenses, totalOutflow, remaining,
      paidLoan, paidCc, paidExpenses, actualOutflow, actualRemaining,
    };
  }, [budget, expenses, loans, savingsGoal, repayments, paidRepayments]);

  const goalProgress =
    savingsGoal > 0 ? Math.min(100, Math.max(0, (c.actualRemaining / savingsGoal) * 100)) : 0;
  const goalMet = savingsGoal > 0 && c.actualRemaining >= savingsGoal;

  const hasData = c.loanPayment > 0 || c.ccPayment > 0 || c.extraPlanned > 0 || c.totalExpenses > 0 || savingsGoal > 0;

  return (
    <View className="gap-2.5">
      <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">Month summary</Text>
      <View className="rounded-[14px] border border-border/60 bg-card p-3">
        <View className="gap-[7px]">
          {[
            { label: "Monthly Income (after tax)", value: budget.income },
            { label: "Outgoings", value: c.totalOutflow },
            { label: "Paid so far", value: c.actualOutflow },
            { label: "Planned remaining", value: c.remaining },
          ].map(row =>
            <View key={row.label} className="flex-row flex-wrap justify-between gap-2"><Text className="text-xs text-muted-foreground">{row.label}</Text><Text className={`text-xs font-semibold ${row.value < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(row.value)}</Text></View>)}
        </View>
        {hasData && <Pressable onPress={() => setExpanded(value => !value)} accessibilityRole="button" accessibilityLabel="Detailed breakdown" accessibilityState={{ expanded }} className="mt-2 min-h-[44px] flex-row items-center justify-between gap-2">
          <Text className="text-xs font-semibold text-primary">Detailed breakdown</Text><View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}><ChevronDown size={16} color={colors.primary} /></View>
        </Pressable>}
      {hasData && expanded && (
        <Table className="border-0 rounded-none bg-transparent">
          <TableHeader className="bg-transparent px-0">
            <TableHead className="flex-1" />
            <TableHead className="w-[72] text-right">Planned</TableHead>
            <TableHead className="w-[72] text-right">Actual</TableHead>
          </TableHeader>
          <TableBody>
            {c.loanPayment > 0 && <TableRow className="border-t-0 px-0 py-1">
              <TableCell numberOfLines={1} className="flex-1 text-chart-1">Loan Payment</TableCell>
              <TableCell className="w-[72] text-right text-chart-1">{formatCurrency(c.loanPayment)}</TableCell>
              <View className="w-[72] flex-row items-center justify-end gap-1">
                <Text numberOfLines={1} className={`text-sm ${budget.loan_paid ? "font-semibold text-chart-1" : "text-foreground"}`}>
                  {formatCurrency(c.paidLoan)}
                </Text>
                {budget.loan_paid && <CircleCheck size={12} color={colors.success} />}
              </View>
            </TableRow>}

            {c.cards.filter((card) => card.payment > 0).map(({ slot, card, payment, paid, actual }) => (
            <TableRow key={slot} className="border-t-0 px-0 py-1">
              <TableCell numberOfLines={1} className="flex-1 text-chart-2">{card.name || (slot === 1 ? "Credit Card Payment" : "Second Credit Card")}</TableCell>
              <TableCell className="w-[72] text-right text-chart-2">{formatCurrency(payment)}</TableCell>
              <View className="w-[72] flex-row items-center justify-end gap-1">
                <Text numberOfLines={1} className={`text-sm ${paid ? "font-semibold text-chart-2" : "text-foreground"}`}>
                  {formatCurrency(actual)}
                </Text>
                {paid && <CircleCheck size={12} color={colors.success} />}
              </View>
            </TableRow>
            ))}

            {c.extra.map(({ plan, payment, paid }) => <TableRow key={`repayment-${plan.id}`} className="border-t-0 px-0 py-1">
              <TableCell numberOfLines={1} className={`flex-1 ${plan.kind === "loan" ? "text-chart-1" : "text-chart-2"}`}>{plan.name}</TableCell>
              <TableCell className={`w-[72] text-right ${plan.kind === "loan" ? "text-chart-1" : "text-chart-2"}`}>{formatCurrency(payment)}</TableCell>
              <View className="w-[72] flex-row items-center justify-end gap-1">
                <Text numberOfLines={1} className={`text-sm ${paid ? plan.kind === "loan" ? "font-semibold text-chart-1" : "font-semibold text-chart-2" : "text-foreground"}`}>{formatCurrency(paid ? payment : 0)}</Text>
                {paid && <CircleCheck size={12} color={colors.success} />}
              </View>
            </TableRow>)}

            <TableRow className="border-t-0 px-0 py-1">
              <TableCell numberOfLines={1} className="flex-1 text-chart-3">Total Custom Expenses</TableCell>
              <TableCell className="w-[72] text-right text-chart-3">{formatCurrency(c.totalExpenses)}</TableCell>
              <View className="w-[72] flex-row items-center justify-end gap-1">
                <Text numberOfLines={1} className={`text-sm ${c.paidExpenses > 0 ? "font-semibold text-chart-3" : "text-foreground"}`}>
                  {formatCurrency(c.paidExpenses)}
                </Text>
                {c.paidExpenses > 0 && <CircleCheck size={12} color={colors.success} />}
              </View>
            </TableRow>

            {savingsGoal > 0 && (
              <TableRow className="border-t-0 px-0 py-1">
                <TableCell numberOfLines={1} className="flex-1 text-chart-4">Monthly Savings Target</TableCell>
                <TableCell className="w-[72] text-right text-chart-4">-{formatCurrency(savingsGoal)}</TableCell>
                <Text className="w-[72]" />
              </TableRow>
            )}

            <View className="my-0.5 border-t border-border" />

            <TableRow className="border-t-0 px-0 py-1">
              <TableCell numberOfLines={1} className="flex-1 font-medium">TOTAL MONTHLY OUTFLOW</TableCell>
              <TableCell className="w-[72] text-right font-medium">{formatCurrency(c.totalOutflow)}</TableCell>
              <TableCell className="w-[72] text-right font-medium">{formatCurrency(c.actualOutflow)}</TableCell>
            </TableRow>

            <TableRow className="border-t-0 px-0 py-1">
              <TableCell numberOfLines={1} className={`flex-1 font-semibold ${c.remaining >= 0 ? "text-success" : "text-destructive"}`}>
                REMAINDER / SAVINGS
              </TableCell>
              <TableCell className={`w-[72] text-right font-semibold ${c.remaining >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(c.remaining)}
              </TableCell>
              <View className="w-[72] flex-row items-center justify-end gap-1">
                <Text numberOfLines={1} className={`text-sm font-semibold ${c.actualRemaining >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(c.actualRemaining)}
                </Text>
                {c.actualRemaining >= 0 && <CircleCheck size={12} color={colors.success} />}
              </View>
            </TableRow>
          </TableBody>
        </Table>
      )}

      {savingsGoal > 0 && expanded && (
        <View className="mt-3 rounded-lg bg-muted/60 p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Monthly Savings Target</Text>
            {goalMet && (
              <View className="flex-row items-center gap-1">
                <CircleCheck size={14} color={colors.success} />
                <Text className="text-xs font-semibold text-success">Target met</Text>
              </View>
            )}
          </View>

          <View className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-border">
            <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${goalProgress}%` }} />
          </View>
        </View>
      )}
      </View>
    </View>
  );
}
