import { Text } from "./ui/Typography";
import { memo, useState } from "react";
import { View, Pressable } from "react-native";
import { Trash2, ChevronDown, MoreHorizontal, CircleCheck, Pencil } from "./AppIcons";
import { useI18n, monthLabelFull } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
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
  expanded?: boolean;
  onToggleExpand?: () => void;
  variant?: "compact" | "featured";
}

export const BudgetMonthCard = memo(function BudgetMonthCard({ summary, onOpen, onDelete,
  expanded, onToggleExpand, variant = "compact" }: BudgetMonthCardProps) {
  const { t, lang } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const monthLabel = monthLabelFull(lang, summary.month);
  const featured = variant === "featured";
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const handleToggle = onToggleExpand ?? (() => setInternalExpanded(value => !value));
  const details = [
    { label: t("incomeColon"), value: summary.income },
    { label: t("dashboardPlannedOutflow"), value: summary.outflow },
    { label: t("dashboardPaidOutflow"), value: summary.actualOutflow },
    { label: t("dashboardActualRemaining"), value: summary.actualRemaining },
  ];
  return <Card className={featured ? "border-primary/20 p-[14px]" : undefined}>
    <View className="flex-row items-center gap-2">
      <Pressable onPress={onOpen} className="min-h-[44px] min-w-0 flex-1 justify-center active:opacity-70"
        accessible accessibilityRole="button" accessibilityLabel={t("dashboardOpenMonth", { month: monthLabel })}>
        {featured && <Text className="mb-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-primary">{t("dashboardCurrentMonth")}</Text>}
        <Text className={cn("font-semibold text-foreground", featured ? "text-[17px]" : "text-sm")}>{monthLabel}</Text>
        {!featured && <>
          <Text className="mt-[3px] text-[11px] text-muted-foreground">{t("dashboardPlannedRemaining")}</Text>
          <Text className={cn("mt-[3px] text-base font-semibold", summary.remaining < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(summary.remaining)}</Text>
        </>}
      </Pressable>
      <IconButton icon={ChevronDown} className={isExpanded ? "rotate-180" : "rotate-0"}
        onPress={() => { void haptics.light(); handleToggle(); }}
        accessibilityLabel={isExpanded ? t("collapse") : t("expand")} accessibilityState={{ expanded: isExpanded }} />
      <View ref={triggerRef} collapsable={false}>
        <IconButton icon={MoreHorizontal} selected={anchor !== null} onPress={() => { void haptics.light(); open(); }}
          accessibilityLabel={t("dashboardMonthOptions", { month: monthLabel })} accessibilityState={{ expanded: anchor !== null }} />
      </View>
    </View>
    {featured && <>
      <Pressable onPress={onOpen} className="min-h-[44px] pb-[11px] pt-3 active:opacity-70"
        accessible accessibilityRole="button" accessibilityLabel={t("dashboardOpenMonth", { month: monthLabel })}>
        <Text className="text-xs text-muted-foreground">{t("dashboardActualRemaining")}</Text>
        <Text className={cn("mt-[3px] text-[28px] font-semibold tracking-[-0.5px]", summary.actualRemaining < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(summary.actualRemaining)}</Text>
      </Pressable>
      <View className="flex-row flex-wrap gap-4 rounded-[10px] bg-background p-2.5">
        <View className="min-w-[112px] flex-1 gap-1"><Text className="text-[11px] text-muted-foreground">{t("dashboardPlannedRemaining")}</Text><Text className={cn("text-[15px] font-semibold", summary.remaining < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(summary.remaining)}</Text></View>
        <View className="min-w-[112px] flex-1 gap-1"><Text className="text-[11px] text-muted-foreground">{t("dashboardPaidOutflow")}</Text><Text className="text-[15px] font-semibold text-foreground">{formatCurrency(summary.actualOutflow)}</Text></View>
      </View>
    </>}
    {(featured || isExpanded) && summary.savingsGoal > 0 && <View className="mt-3 gap-[7px]">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-[11px] text-muted-foreground">{t("dashboardSavingsTarget", { amount: formatCurrency(summary.savingsGoal) })}</Text>
        <View className="flex-row items-center gap-1"><CircleCheck size={13} color={summary.goalMet ? colors.success : colors.mutedForeground} /><Text className={cn("text-[11px]", summary.goalMet ? "text-success" : "text-muted-foreground")}>{t(summary.goalMet ? "dashboardTargetMet" : "dashboardTargetProgress")}</Text></View>
      </View>
      <View className="h-[5px] overflow-hidden rounded-full bg-success/10" accessible accessibilityRole="progressbar"
        accessibilityLabel={t("dashboardSavingsProgress")} accessibilityValue={{ min: 0, max: 100, now: summary.goalProgress }}>
        <View className="h-full rounded-full bg-success" style={{ width: `${summary.goalProgress}%` }} />
      </View>
    </View>}
    {isExpanded && <View className="mt-3 gap-[7px] border-t border-border/60 pt-2.5">
      {details.map(detail => <View key={detail.label} className="flex-row flex-wrap justify-between gap-3">
        <Text className="shrink text-xs text-muted-foreground">{detail.label}</Text>
        <Text className={cn("text-xs font-semibold", detail.value < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(detail.value)}</Text>
      </View>)}
    </View>}
    <AnchoredMenu anchor={anchor} onClose={close} items={[
      { key: "open", label: t("dashboardOpenBudget"), icon: Pencil, onPress: onOpen },
      { key: "delete", label: t("delete"), icon: Trash2, destructive: true, onPress: () => { void haptics.warning(); onDelete(); } },
    ]} />
  </Card>;
});
