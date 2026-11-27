import { actionErrorOptions } from "../../src/lib/actionErrorOptions";
import { Text } from "../../src/components/ui/Typography";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, View, FlatList, Pressable, StyleSheet } from "react-native";
import { Plus, PiggyBank, ChevronRight } from "../../src/components/AppIcons";
import { getSavingsSummary } from "../../src/lib/savings";
import { formatCurrency } from "../../src/lib/utils";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";

import { monthLabel } from "../../src/lib/monthLabel";
import { useThemeColors } from "../../src/lib/theme";
import {
  addMonths,
  currentMonth,
  createBudgetMonth,
  deleteBudget,
  listMonthSummaries,
  loadBudget,
  loadLoans,
  saveLoans,
  type MonthSummary,
} from "../../src/lib/budget";
import { withTransaction } from "../../src/lib/db";
import { HubHeader } from "../../src/components/HubHeader";
import { BudgetMonthCard } from "../../src/components/BudgetMonthCard";
import { BudgetMonthEditor } from "../../src/components/BudgetMonthEditor";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";

export default function DashboardScreen() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [savingsBalance, setSavingsBalance] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null);
  const [quickExpense, setQuickExpense] = useState(false);
  const [creatingMonth, setCreatingMonth] = useState<string | null>(null);
  const refreshRequest = useRef(0);

  const colors = useThemeColors();
  const thisMonth = currentMonth();
  const currentSummary = summaries.find((summary) => summary.month === thisMonth);
  const upcoming = summaries.filter(summary => summary.month > thisMonth).reverse();
  const previous = summaries.filter(summary => summary.month < thisMonth);
  const firstUpcoming = upcoming[0]?.month;
  const firstPrevious = previous[0]?.month;

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    setLoadState("loading");
    try {
      const loans = await loadLoans();
      const [data, savings] = await Promise.all([listMonthSummaries(loans), getSavingsSummary()]);
      if (request !== refreshRequest.current) return;
      setSavingsBalance(savings.balance);
      setSummaries(data);
      setLoadState("ready");
    } catch {
      if (request !== refreshRequest.current) return;
      setLoadState("error");
      toast.error("Failed to load data.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        ++refreshRequest.current;
      };
    }, [refresh])
  );

  const openBudgetMonth = useCallback(
    (month: string) => {

      router.push(`/(budget)/budget?month=${encodeURIComponent(month)}`);
    },
    [router]
  );

  const confirmDelete = useCallback(async () => {
    if (!monthToDelete) return;
    const month = monthToDelete;
    setMonthToDelete(null);
    try {
      await withTransaction(async (tx) => {
        const budget = await loadBudget(month, tx);
        if (budget?.loan_paid || budget?.cc_paid || budget?.cc2_paid) {
          const loans = await loadLoans(tx);
          await saveLoans(
            {
              ...loans,
              loan_months_paid: budget.loan_paid
                ? loans.loan_term > 0
                  ? Math.max(0, Math.min(loans.loan_term, loans.loan_months_paid - 1))
                  : Math.max(0, loans.loan_months_paid - 1)
                : loans.loan_months_paid,
              cc_months_paid: budget.cc_paid
                ? Math.max(0, loans.cc_months_paid - 1)
                : loans.cc_months_paid,
              cc2_months_paid: budget.cc2_paid
                ? Math.max(0, loans.cc2_months_paid - 1)
                : loans.cc2_months_paid,
            },
            tx
          );
        }
        await deleteBudget(month, tx);
      });
      toast.success("Budget deleted");
      await refresh();

    } catch {
      toast.error("Failed to delete budget.", actionErrorOptions);
    }
  }, [monthToDelete, refresh]);

  const handleCreateMonth = useCallback((month: string) => {
    if (summaries.some((item) => item.month === month)) openBudgetMonth(month);
    else setCreatingMonth(month);
  }, [summaries, openBudgetMonth]);

  const renderMonth = ({ item }: { item: MonthSummary }) => (
    <View className="gap-3">
      {(item.month === firstUpcoming || item.month === firstPrevious) && (
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {item.month === firstUpcoming ? "Upcoming" : "Previous months"}
        </Text>
      )}
      <BudgetMonthCard
        summary={item}
        onOpen={() => openBudgetMonth(item.month)}
        onDelete={() => setMonthToDelete(item.month)}
      />
    </View>
  );

  const addExpense = (
    <Button
      label="Add expense"
      className="self-start"
      icon={Plus}
      disabled={creatingMonth !== null}
      onPress={() => {
        if (currentSummary) {
          router.push(`/(budget)/budget?month=${thisMonth}&addExpense=1`);
        } else {
          setQuickExpense(true);
          handleCreateMonth(thisMonth);
        }
      }}
    />
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        className="w-full"
        style={styles.list}
        data={loadState === "ready" ? [...upcoming, ...previous] : []}
        keyExtractor={(item) => item.month}
        renderItem={renderMonth}
        contentContainerClassName="px-page"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View className="gap-4">
            <HubHeader />
            {loadState === "ready" && currentSummary && <Text accessibilityRole="header" className="text-base font-semibold text-foreground">This month</Text>}

            {loadState === "loading" ? (
              <View className="flex-row items-center justify-center gap-3 py-10" accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text className="text-sm text-muted-foreground">Loading…</Text>
              </View>
            ) : loadState === "error" ? (
              <Card className="gap-3">
                <Text className="text-sm text-foreground">Failed to load data.</Text>
                <Button label="Retry" onPress={() => { void refresh(); }} />
              </Card>
            ) : currentSummary ? (
              <BudgetMonthCard
                variant="featured"
                summary={currentSummary}
                onOpen={() => openBudgetMonth(currentSummary.month)}
                onDelete={() => setMonthToDelete(currentSummary.month)}
                footer={addExpense}
              />
            ) : (
              <Card className="gap-4 rounded-[28px] bg-surface-container-high p-5">
                <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">{monthLabel(thisMonth, "short")}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {addExpense}
                  <Button
                    label="Create budget"
                    variant="secondary"
                    icon={Plus}
                    disabled={creatingMonth !== null}
                    onPress={() => handleCreateMonth(thisMonth)}
                  />
                </View>
              </Card>
            )}

            {loadState === "ready" && savingsBalance !== null && (
              <Pressable onPress={() => router.push("/(budget)/savings")} accessibilityRole="button" accessibilityLabel={`Total savings, ${formatCurrency(savingsBalance)}`} className="min-h-[60px] flex-row items-center gap-3 rounded-[24px] border border-border/60 bg-surface px-4 py-2 active:bg-muted">
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
                  <PiggyBank size={19} color={colors.foreground} />
                </View>
                <View className="min-w-0 flex-1 flex-row flex-wrap items-center justify-between gap-x-3">
                  <Text className="text-label-large text-muted-foreground">Total savings</Text>
                  <Text className="shrink text-base font-semibold text-foreground" style={styles.amount}>{formatCurrency(savingsBalance)}</Text>
                </View>
                <ChevronRight size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
            {loadState === "ready" && <Button className="self-start" variant="secondary" icon={Plus} label="Next month" onPress={() => { setQuickExpense(false); handleCreateMonth(addMonths(thisMonth, 1)); }} />}
          </View>
        }
      />

      {creatingMonth ? <BudgetMonthEditor initialMonth={creatingMonth} onClose={() => { setCreatingMonth(null); setQuickExpense(false); }}
        onSave={async (month, income, savingsGoal) => {
          const { created } = await createBudgetMonth(month, { income, savingsGoal });
          setCreatingMonth(null);
          if (created) {
            await refresh();

            toast.success(`Budget created for ${monthLabel(month, "short")}`);
          }
          if (quickExpense) { setQuickExpense(false); router.push(`/(budget)/budget?month=${month}&addExpense=1`); }
          else openBudgetMonth(month);
        }} /> : null}
      <ConfirmDialog
        visible={monthToDelete !== null}
        title="Delete"
        message={
          monthToDelete
            ? `Delete budget for ${monthLabel(monthToDelete, "short")}?`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={() => setMonthToDelete(null)}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingTop: 16, paddingBottom: 16, gap: 12 },
  amount: { fontVariant: ["tabular-nums"] },
});
