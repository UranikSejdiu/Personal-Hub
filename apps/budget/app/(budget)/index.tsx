import { Text } from "../../src/components/ui/Typography";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, View, FlatList, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, PiggyBank, ChevronRight } from "../../src/components/AppIcons";
import { getSavingsSummary } from "../../src/lib/savings";
import { formatCurrency } from "../../src/lib/utils";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";

import { useI18n, monthLabelShort } from "../../src/lib/i18n";
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
import { BudgetMonthCard } from "../../src/components/BudgetMonthCard";
import { BudgetMonthEditor } from "../../src/components/BudgetMonthEditor";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";

export default function DashboardScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [savingsBalance, setSavingsBalance] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null);
  const [quickExpense, setQuickExpense] = useState(false);
  const [creatingMonth, setCreatingMonth] = useState<string | null>(null);
  const refreshRequest = useRef(0);
  const insets = useSafeAreaInsets();

  const colors = useThemeColors();
  const thisMonth = currentMonth();
  const currentSummary = summaries.find((summary) => summary.month === thisMonth);
  const otherMonths = summaries.filter((summary) => summary.month !== thisMonth);

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
      toast.error(t("errorLoadingData"));
    }
  }, [t]);

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
      toast.success(t("monthDeleted"));
      await refresh();

    } catch {
      toast.error(t("errorDeletingBudget"));
    }
  }, [monthToDelete, refresh, t]);

  const handleCreateMonth = useCallback((month: string) => {
    if (summaries.some((item) => item.month === month)) openBudgetMonth(month);
    else setCreatingMonth(month);
  }, [summaries, openBudgetMonth]);

  const renderMonth = useCallback(
    ({ item }: { item: MonthSummary }) => (
      <BudgetMonthCard
        summary={item}
        onOpen={() => openBudgetMonth(item.month)}
        onDelete={() => setMonthToDelete(item.month)}
      />
    ),
    [openBudgetMonth]
  );

  return (
    <View className="flex-1 bg-background">
      <FlatList
        className="w-full max-w-md self-center"
        style={styles.list}
        data={loadState === "ready" ? otherMonths : []}
        keyExtractor={(item) => item.month}
        renderItem={renderMonth}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 128 }]}
        ListHeaderComponent={
          <View className="gap-3">
            <View>
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text accessibilityRole="header" className="text-2xl max-[360px]:text-[21px] font-semibold tracking-[-0.4px] text-foreground">{t("dashboardTitle")}</Text>
                <Button
                  label={t("addRow")}
                  icon={Plus}
                  variant="secondary"
                  disabled={loadState !== "ready" || creatingMonth !== null}

                  onPress={() => { if (currentSummary) router.push(`/(budget)/budget?month=${thisMonth}&addExpense=1`); else { setQuickExpense(true); handleCreateMonth(thisMonth); } }}
                />
              </View>
              <Text className="mt-1 text-xs leading-[18px] text-muted-foreground">{t("dashboardSubtitle")}</Text>
            </View>

            {loadState === "loading" ? (
              <View className="flex-row items-center justify-center gap-3 py-10" accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
              </View>
            ) : loadState === "error" ? (
              <Card className="gap-3">
                <Text className="text-sm text-foreground">{t("errorLoadingData")}</Text>
                <Button label={t("retry")} onPress={() => { void refresh(); }} />
              </Card>
            ) : currentSummary ? (
              <BudgetMonthCard
                variant="featured"
                summary={currentSummary}
                onOpen={() => openBudgetMonth(currentSummary.month)}
                onDelete={() => setMonthToDelete(currentSummary.month)}
              />
            ) : (
              <Card className="gap-3">
                <Text className="text-lg font-semibold text-foreground">{t("dashboardNoCurrentMonth")}</Text>
                <Text className="text-xs leading-[18px] text-muted-foreground">
                  {t("dashboardNoCurrentMonthHint", { month: monthLabelShort(lang, thisMonth) })}
                </Text>
                <Button
                  label={t("dashboardCreateCurrentMonth")}
                  icon={Plus}
                  disabled={creatingMonth !== null}

                  onPress={() => { void handleCreateMonth(thisMonth); }}
                  className="mt-1"
                />
              </Card>
            )}

            {loadState === "ready" && savingsBalance !== null && <View className="gap-2 pt-2">
              <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">{t("navSavings")}</Text>
              <Pressable onPress={() => router.push("/(budget)/savings")} accessibilityRole="button" accessibilityLabel={t("navSavings")} className="min-h-[76px] flex-row items-center gap-3 rounded-[20px] bg-secondary px-4 py-3 active:opacity-70">
                <PiggyBank size={24} color={colors.primary} />
                <View className="flex-1 gap-1"><Text className="text-sm font-semibold text-foreground">{formatCurrency(savingsBalance)}</Text><Text className="text-xs text-muted-foreground">{t("savingsTotal")}</Text></View>
                <ChevronRight size={18} color={colors.primary} />
              </Pressable>
            </View>}
            {loadState === "ready" && <Button className="self-start" variant="secondary" icon={Plus} label={t("dashboardNextMonth")} onPress={() => { setQuickExpense(false); handleCreateMonth(addMonths(thisMonth, 1)); }} />}
            {loadState === "ready" && otherMonths.length > 0 && (
              <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">{t("dashboardOtherMonths")}</Text>
            )}
          </View>
        }
      />

      {creatingMonth ? <BudgetMonthEditor initialMonth={creatingMonth} onClose={() => { setCreatingMonth(null); setQuickExpense(false); }}
        onSave={async (month, income, savingsGoal) => {
          const { created } = await createBudgetMonth(month, { income, savingsGoal });
          setCreatingMonth(null);
          if (created) {
            await refresh();

            toast.success(t("newBudgetCreated", { month: monthLabelShort(lang, month) }));
          }
          if (quickExpense) { setQuickExpense(false); router.push(`/(budget)/budget?month=${month}&addExpense=1`); }
          else openBudgetMonth(month);
        }} /> : null}
      <ConfirmDialog
        visible={monthToDelete !== null}
        title={t("deleteConfirmTitle")}
        message={
          monthToDelete
            ? t("deleteMonthConfirm", { month: monthLabelShort(lang, monthToDelete) })
            : ""
        }
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        destructive
        onClose={() => setMonthToDelete(null)}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
});
