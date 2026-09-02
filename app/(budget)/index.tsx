import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { Trash2, Plus, ChevronDown } from "lucide-react-native";
import { useRouter } from "expo-router";
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
  type MonthSummary,
} from "../../src/lib/budget";
import { formatCurrency } from "../../src/lib/utils";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

export default function DashboardScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [summaries, setSummaries] = useState<MonthSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  }, [t]);

  const toggleMonth = useCallback((month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }, []);

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
      await deleteBudget(month);
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
      const prevBudget = await loadBudget(addMonths(now, -1));
      const { salary } = await loadSavingsGoal();
      const seedIncome = prevBudget && prevBudget.income > 0 ? prevBudget.income : salary;
      const nextMonth = addMonths(now, 1);
      const budget = await saveBudget(nextMonth, seedIncome, false, false);
      await populateRecurringExpenses(budget.id);
      await refresh();
      haptics.medium();
      toast.success(t("newBudgetCreated", { month: monthLabelShort(lang, nextMonth) }));
      openBudgetMonth(nextMonth);
    } catch {
      toast.error(t("errorLoadingData"));
    } finally {
      setCreatingBudget(false);
    }
  }, [creatingBudget, openBudgetMonth, refresh, lang, t, haptics]);

  const renderMonth = useCallback(
    ({ item }: { item: MonthSummary }) => {
      const expanded = expandedMonths.has(item.month);
      return (
        <Pressable
          onPress={() => openBudgetMonth(item.month)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
          className="rounded-xl border border-border bg-card p-3"
          android_ripple={{ color: colors.primary + "20" }}
          accessibilityRole="button"
          accessibilityLabel={monthLabelShort(lang, item.month)}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text
                onPress={(e) => {
                  e.stopPropagation();
                  openBudgetMonth(item.month);
                }}
                className="font-medium text-foreground underline"
              >
                {monthLabelShort(lang, item.month)}
              </Text>
              <Text
                className={`text-xs ${item.remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {formatCurrency(item.remaining)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  toggleMonth(item.month);
                }}
                className="h-6 w-6 items-center justify-center rounded-md transition-colors"
                accessibilityLabel={expanded ? t("collapse") : t("expand")}
                accessibilityRole="button"
                android_ripple={{ color: colors.primary + "20" }}
              >
                <ChevronDown
                  size={16}
                  color={item.remaining < 0 ? colors.destructive : colors.mutedForeground}
                  style={expanded ? styles.rotated : undefined}
                />
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setMonthToDelete(item.month);
                }}
                className="h-6 w-6 items-center justify-center rounded-md transition-colors"
                accessibilityLabel={t("delete")}
                accessibilityRole="button"
                android_ripple={{ color: colors.destructive + "20" }}
              >
                <Trash2 size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          {expanded && (
            <View className="mt-2 gap-1">
              <View className="flex-row justify-between text-xs">
                <Text className="text-muted-foreground">{t("incomeColon")} </Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(item.income)}
                </Text>
              </View>
              <View className="flex-row justify-between text-xs">
                <Text className="text-muted-foreground">{t("plannedColon")} </Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(item.outflow)}
                </Text>
              </View>
              <View className="flex-row justify-between text-xs">
                <Text className="text-muted-foreground">{t("remainsColon")} </Text>
                <Text
                  className={item.remaining < 0 ? "text-destructive" : "font-medium text-foreground"}
                >
                  {formatCurrency(item.remaining)}
                </Text>
              </View>
              <View className="flex-row justify-between text-xs">
                <Text className="text-muted-foreground">{t("paidColon")} </Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(item.actualOutflow)}
                </Text>
              </View>
              <View className="flex-row justify-between text-xs">
                <Text className="text-muted-foreground">{t("actuallyRemainsColon")} </Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(item.actualRemaining)}
                </Text>
              </View>

              {item.savingsGoal > 0 && (
                <View className="mt-1 gap-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-muted-foreground">{t("goalColon")}</Text>
                    <Text
                      className={item.goalMet ? "text-success" : "font-medium text-foreground"}
                    >
                      {formatCurrency(Math.max(0, item.actualRemaining))} /{" "}
                      {formatCurrency(item.savingsGoal)}
                    </Text>
                  </View>
                  <View className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <View
                      className={item.goalMet ? "bg-success" : "bg-primary"}
                      style={{ width: `${item.goalProgress}%`, height: "100%" }}
                    />
                  </View>
                </View>
              )}
            </View>
          )}
        </Pressable>
      );
    },
    [expandedMonths, lang, openBudgetMonth, t, toggleMonth]
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
            android_ripple={{ color: colors.primaryForeground + "30" }}
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="ml-1.5 text-sm font-medium text-primary-foreground">{t("newBudget")}</Text>
          </Pressable>
        </View>

        {!loaded ? (
          <Text className="text-sm text-muted-foreground">{t("loading")}</Text>
        ) : summaries.length === 0 ? (
          <Text className="text-sm text-muted-foreground">{t("noBudgetsSaved")}</Text>
        ) : (
          <FlatList
            data={summaries}
            keyExtractor={(item) => item.month}
            renderItem={renderMonth}
            contentContainerStyle={{ gap: 8 }}
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
  rotated: {
    transform: [{ rotate: "180deg" }],
  },
});
