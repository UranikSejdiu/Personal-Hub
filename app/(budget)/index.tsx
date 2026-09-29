import { useCallback, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { Plus } from "../../src/components/AppIcons";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";

import { useI18n, monthLabelShort } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import { useThemeColors } from "../../src/lib/theme";
import {
  addMonths,
  currentMonth,
  deleteBudget,
  listMonthSummaries,
  loadBudget,
  loadLoans,
  loadSavingsGoal,
  populateRecurringExpenses,
  saveBudget,
  saveLoans,
  type MonthSummary,
} from "../../src/lib/budget";
import { withTransaction } from "../../src/lib/db";
import { withAlpha } from "../../src/lib/utils";
import { BudgetMonthCard } from "../../src/components/BudgetMonthCard";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

export default function DashboardScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null);
  const [creatingBudget, setCreatingBudget] = useState(false);

  const haptics = useHaptics();
  const colors = useThemeColors();

  const refresh = useCallback(async () => {
    try {
      const loans = await loadLoans();
      const data = await listMonthSummaries(loans);
      setSummaries(data);
    } catch {
      toast.error(t("errorLoadingData"));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const loans = await loadLoans();
          const data = await listMonthSummaries(loans);
          if (!cancelled) setSummaries(data);
        } catch {
          if (!cancelled) toast.error(t("errorLoadingData"));
        } finally {
          if (!cancelled) setLoaded(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [t])
  );

  const openBudgetMonth = useCallback(
    (month: string) => {
      void haptics.light();
      router.push(`/(budget)/budget?month=${encodeURIComponent(month)}`);
    },
    [router, haptics]
  );

  const confirmDelete = useCallback(async () => {
    if (!monthToDelete) return;
    const month = monthToDelete;
    setMonthToDelete(null);
    try {
      await withTransaction(async (tx) => {
        const budget = await loadBudget(month, tx);
        if (budget?.loan_paid || budget?.cc_paid) {
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
            },
            tx
          );
        }
        await deleteBudget(month, tx);
      });
      await refresh();
      haptics.success();
    } catch {
      toast.error(t("errorDeletingBudget"));
    }
  }, [monthToDelete, refresh, t, haptics]);

  const handleNewBudget = useCallback(async () => {
    if (creatingBudget) return;
    setCreatingBudget(true);
    try {
      const now = currentMonth();
      const nextMonth = addMonths(now, 1);
      const existing = await loadBudget(nextMonth);
      if (existing) {
        openBudgetMonth(nextMonth);
        return;
      }
      const prevBudget = await loadBudget(addMonths(nextMonth, -1));
      const { salary } = await loadSavingsGoal();
      const seedIncome = prevBudget && prevBudget.income > 0 ? prevBudget.income : salary;
      const budget = await saveBudget(nextMonth, seedIncome, false, false);
      await populateRecurringExpenses(budget.id);
      await refresh();
      haptics.medium();
      toast.success(t("newBudgetCreated", { month: monthLabelShort(lang, nextMonth) }));
      openBudgetMonth(nextMonth);
    } catch {
      toast.error(t("errorCreatingBudget"));
    } finally {
      setCreatingBudget(false);
    }
  }, [creatingBudget, openBudgetMonth, refresh, lang, t, haptics]);

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
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{t("recentMonths")}</Text>
          <Pressable
            onPress={handleNewBudget}
            disabled={creatingBudget}
            className="flex-row items-center rounded-lg bg-primary px-3 py-1.5 opacity-100 disabled:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={t("newBudget")}
            android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="ml-1.5 text-sm font-medium text-primary-foreground">{t("newBudget")}</Text>
          </Pressable>
        </View>

        {!loaded ? (
          <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
        ) : summaries.length === 0 ? (
          <View className="items-center gap-2 rounded-xl border border-border bg-card px-5 py-8">
            <Text className="text-center text-base font-semibold text-foreground">
              {t("dashboardEmptyTitle")}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {t("dashboardEmptyHint")}
            </Text>
            <Pressable
              onPress={handleNewBudget}
              disabled={creatingBudget}
              className="mt-2 flex-row items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 disabled:opacity-60"
              accessibilityRole="button"
              accessibilityLabel={t("newBudget")}
              android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
            >
              <Plus size={16} color={colors.primaryForeground} />
              <Text className="text-sm font-medium text-primary-foreground">{t("newBudget")}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={summaries}
            keyExtractor={(item) => item.month}
            renderItem={renderMonth}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

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
  listContent: { gap: 8 },
});
