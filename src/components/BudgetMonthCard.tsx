import { memo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Trash2, ChevronDown, MoreHorizontal } from "./AppIcons";
import { useI18n, monthLabelShort } from "../lib/i18n";
import { useHaptics } from "../hooks/useHaptics";
import { formatCurrency, cn } from "../lib/utils";
import { IconButton } from "./ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";
import { Card } from "./ui/Card";
import type { MonthSummary } from "../types/budget";

interface BudgetMonthCardProps {
  summary: MonthSummary;
  onOpen: () => void;
  onDelete: () => void;
  /** Controlled expand state (used by the tutorial); the card manages its own otherwise. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  variant?: "compact" | "featured";
}

export const BudgetMonthCard = memo(function BudgetMonthCard({
  summary,
  onOpen,
  onDelete,
  expanded,
  onToggleExpand,
  variant = "compact",
}: BudgetMonthCardProps) {
  const { t, lang } = useI18n();
  const haptics = useHaptics();
  const monthLabel = monthLabelShort(lang, summary.month);
  const featured = variant === "featured";
  const { triggerRef, anchor, open, close } = useAnchoredMenu();

  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const handleToggle = onToggleExpand ?? (() => setInternalExpanded((value) => !value));

  const details = [
    { label: t("incomeColon"), value: summary.income },
    { label: t("dashboardPlannedOutflow"), value: summary.outflow },
    ...(!featured ? [
      { label: t("dashboardPlannedRemaining"), value: summary.remaining },
      { label: t("dashboardPaidOutflow"), value: summary.actualOutflow },
      { label: t("dashboardActualRemaining"), value: summary.actualRemaining },
    ] : []),
  ];

  return (
    <Card className={featured ? "border-primary/20" : undefined}>
      <View className="flex-row items-start gap-2">
        <Pressable
          onPress={onOpen}
          className="min-h-[44px] min-w-0 flex-1 rounded-xl py-1 active:opacity-70"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t("dashboardOpenMonth", { month: monthLabel })}
        >
          {featured && (
            <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{t("dashboardCurrentMonth")}</Text>
          )}
          <Text className={cn("text-foreground", featured ? "text-lg font-semibold" : "text-base font-semibold")}>{monthLabel}</Text>
          <Text className="mt-1.5 text-xs text-muted-foreground">
            {t(featured ? "dashboardActualRemaining" : "dashboardPlannedRemaining")}
          </Text>
          <Text
            className={cn(
              "mt-1",
              featured ? "text-3xl font-display" : "text-lg font-semibold",
              (featured ? summary.actualRemaining : summary.remaining) < 0 ? "text-destructive" : "text-foreground"
            )}
          >
            {formatCurrency(featured ? summary.actualRemaining : summary.remaining)}
          </Text>
        </Pressable>
        <View className="flex-row">
          <IconButton
            icon={ChevronDown}
            className={isExpanded ? "rotate-180" : "rotate-0"}
            onPress={() => { void haptics.light(); handleToggle(); }}
            accessibilityLabel={isExpanded ? t("collapse") : t("expand")}
            accessibilityState={{ expanded: isExpanded }}
          />
          <View ref={triggerRef} collapsable={false}>
            <IconButton
              icon={MoreHorizontal}
              selected={anchor !== null}
              onPress={() => { void haptics.light(); open(); }}
              accessibilityLabel={t("dashboardMonthOptions", { month: monthLabel })}
              accessibilityState={{ expanded: anchor !== null }}
            />
          </View>
        </View>
      </View>

      <AnchoredMenu anchor={anchor} onClose={close} items={[
        { key: "delete", label: t("delete"), icon: Trash2, destructive: true,
          onPress: () => { void haptics.warning(); onDelete(); } },
      ]} />

      {featured && (
        <View className="mt-2.5 flex-row flex-wrap gap-3 rounded-xl bg-surface p-2.5">
          <View className="min-w-[112px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">{t("dashboardPlannedRemaining")}</Text>
            <Text className={cn("text-base font-semibold", summary.remaining < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(summary.remaining)}</Text>
          </View>
          <View className="min-w-[112px] flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">{t("dashboardPaidOutflow")}</Text>
            <Text className="text-base font-semibold text-foreground">{formatCurrency(summary.actualOutflow)}</Text>
          </View>
        </View>
      )}

      {isExpanded && (
        <View className="mt-3 gap-2.5 border-t border-border/60 pt-3">
          {details.map((detail) => (
            <View key={detail.label} className="flex-row flex-wrap justify-between gap-2">
              <Text className="shrink text-sm text-muted-foreground">{detail.label}</Text>
              <Text className={cn("text-sm font-medium", detail.value < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(detail.value)}</Text>
            </View>
          ))}
        </View>
      )}

      {summary.savingsGoal > 0 && (featured || isExpanded) && (
        <View className="mt-2.5 gap-1.5">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-xs text-muted-foreground">{t("dashboardSavingsProgress")}</Text>
            <Text className={cn("text-xs font-semibold", summary.goalMet ? "text-success" : "text-foreground")}>
              {formatCurrency(Math.max(0, summary.actualRemaining))} / {formatCurrency(summary.savingsGoal)}
            </Text>
          </View>
          <View
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t("dashboardSavingsProgress")}
            accessibilityValue={{ min: 0, max: 100, now: summary.goalProgress }}
          >
            <View
              className={cn("h-full rounded-full", summary.goalMet ? "bg-success" : "bg-primary")}
              style={{ width: `${summary.goalProgress}%` }}
            />
          </View>
        </View>
      )}
    </Card>
  );
});
