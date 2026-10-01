import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, View, Text, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus } from "../../src/components/AppIcons";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";

import { useI18n, monthLabelShort } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
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
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";

export default function DashboardScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null);
  const [creatingMonth, setCreatingMonth] = useState<string | null>(null);
  const creationInFlight = useRef(false);
  const insets = useSafeAreaInsets();

  const haptics = useHaptics();
  const colors = useThemeColors();
  const thisMonth = currentMonth();
  const currentSummary = summaries.find((summary) => summary.month === thisMonth);
  const otherMonths = summaries.filter((summary) => summary.month !== thisMonth);

  const refresh = useCallback(async () => {
    setLoadState("loading");
    try {
      const loans = await loadLoans();
      const data = await listMonthSummaries(loans);
      setSummaries(data);
      setLoadState("ready");
    } catch {
      setLoadState("error");
      toast.error(t("errorLoadingData"));
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadState("loading");
      void (async () => {
        try {
          const loans = await loadLoans();
          const data = await listMonthSummaries(loans);
          if (!cancelled) {
            setSummaries(data);
            setLoadState("ready");
          }
        } catch {
          if (!cancelled) {
            setLoadState("error");
            toast.error(t("errorLoadingData"));
          }
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
      await refresh();
      void haptics.success();
    } catch {
      toast.error(t("errorDeletingBudget"));
    }
  }, [monthToDelete, refresh, t, haptics]);

  const handleCreateMonth = useCallback(async (month: string) => {
    if (creationInFlight.current) return;
    creationInFlight.current = true;
    setCreatingMonth(month);
    try {
      const { created } = await createBudgetMonth(month);
      if (created) {
        await refresh();
        void haptics.medium();
        toast.success(t("newBudgetCreated", { month: monthLabelShort(lang, month) }));
      }
      openBudgetMonth(month);
    } catch {
      toast.error(t("errorCreatingBudget"));
    } finally {
      creationInFlight.current = false;
      setCreatingMonth(null);
    }
  }, [openBudgetMonth, refresh, lang, t, haptics]);

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
          <View className="gap-5">
            <View>
              <View className="flex-row flex-wrap items-center justify-between gap-3">
                <Text accessibilityRole="header" className="text-3xl font-display text-foreground">{t("dashboardTitle")}</Text>
                <Button
                  label={t("dashboardNextMonth")}
                  icon={Plus}
                  variant="secondary"
                  disabled={loadState !== "ready" || creatingMonth !== null}
                  busy={creatingMonth === addMonths(thisMonth, 1)}
                  onPress={() => { void handleCreateMonth(addMonths(thisMonth, 1)); }}
                />
              </View>
              <Text className="mt-2 text-sm leading-5 text-muted-foreground">{t("dashboardSubtitle")}</Text>
            </View>

            {loadState === "loading" ? (
              <View className="flex-row items-center justify-center gap-3 py-10" accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.primary} />
                <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
              </View>
            ) : loadState === "error" ? (
              <Card className="gap-4">
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
              <Card className="gap-3 p-5">
                <Text className="text-lg font-semibold text-foreground">{t("dashboardNoCurrentMonth")}</Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {t("dashboardNoCurrentMonthHint", { month: monthLabelShort(lang, thisMonth) })}
                </Text>
                <Button
                  label={t("dashboardCreateCurrentMonth")}
                  icon={Plus}
                  disabled={creatingMonth !== null}
                  busy={creatingMonth === thisMonth}
                  onPress={() => { void handleCreateMonth(thisMonth); }}
                  className="mt-1"
                />
              </Card>
            )}

            {loadState === "ready" && otherMonths.length > 0 && (
              <Text accessibilityRole="header" className="text-base font-semibold text-foreground">{t("dashboardOtherMonths")}</Text>
            )}
          </View>
        }
      />

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
  listContent: { padding: 16, gap: 12 },
});
