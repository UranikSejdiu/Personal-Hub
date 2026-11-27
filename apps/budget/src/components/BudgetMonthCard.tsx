import { Text } from "./ui/Typography";
import { memo, useState, type ReactNode } from "react";
import { View, Pressable } from "react-native";
import { ChevronDown, MoreHorizontal, CircleCheck } from "./AppIcons";
import { monthLabel } from "../lib/monthLabel";
import { useThemeColors } from "../lib/theme";
import { formatCurrency, cn } from "../lib/utils";
import { IconButton } from "./ui/Button";
import { ActionDialog } from "./ui/ActionDialog";
import { Card } from "./ui/Card";
import type { MonthSummary } from "../types/budget";

interface BudgetMonthCardProps {
  summary: MonthSummary;
  onOpen: () => void;
  onDelete: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  variant?: "compact" | "featured";
  footer?: ReactNode;
}

export const BudgetMonthCard = memo(function BudgetMonthCard({ summary, onOpen, onDelete,
  expanded, onToggleExpand, variant = "compact", footer }: BudgetMonthCardProps) {
  const colors = useThemeColors();
  const monthName = monthLabel(summary.month);
  const featured = variant === "featured";
  const primaryAmount = featured ? summary.actualRemaining : summary.remaining;
  const primaryBalance = formatCurrency(primaryAmount);
  const plannedBalance = formatCurrency(summary.remaining);
  const unpaid = Math.max(0, summary.outflow - summary.savingsGoal - summary.actualOutflow);
  const showPlanned = primaryBalance !== plannedBalance;
  const hasUnpaid = unpaid >= 0.005;
  const [menuOpen, setMenuOpen] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const handleToggle = onToggleExpand ?? (() => setInternalExpanded(value => !value));
  const details = [
    { label: "Income", value: summary.income },
    { label: "Outgoings", value: summary.outflow },
    { label: "Paid so far", value: summary.actualOutflow },
    ...(!featured ? [{ label: "Current remaining", value: summary.actualRemaining }] : []),
  ];
  return <Card className={cn("gap-3", featured ? "rounded-[28px] bg-surface-container-high p-5" : "border-border/60 py-2 pl-4 pr-2")}>
    <View className={cn("flex-row", featured ? "items-start" : "items-center")}>
      <Pressable onPress={onOpen}
        className={cn("min-h-[48px] min-w-0 flex-1 active:opacity-70", featured ? "justify-center" : "flex-row items-center justify-between gap-2")}
        accessible accessibilityRole="button"
        accessibilityLabel={featured
          ? `Open budget for ${monthName}, current remaining ${primaryBalance}`
          : `Open budget for ${monthName}, planned remaining ${primaryBalance}`}>
        <Text className={cn("font-semibold text-foreground", featured ? "mb-2 text-xl" : "min-w-0 shrink text-base")}>{monthName}</Text>
        {featured && <Text className="text-label-medium text-muted-foreground">Current remaining</Text>}
        <View className={featured ? "" : "max-w-[55%] shrink items-end"}>
          {!featured && <Text className="text-label-medium text-muted-foreground">Planned remaining</Text>}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontVariant: ["tabular-nums"] }}
            className={cn("font-semibold", featured ? "text-[34px]" : "text-right text-base", primaryAmount < 0 ? "text-destructive" : "text-foreground")}>
            {primaryBalance}
          </Text>
        </View>
      </Pressable>
      <IconButton icon={ChevronDown} className={isExpanded ? "rotate-180" : "rotate-0"}
        onPress={() => { handleToggle(); }}
        accessibilityLabel={isExpanded ? "Collapse" : "Expand"} accessibilityState={{ expanded: isExpanded }} />
      <View>
        <IconButton icon={MoreHorizontal} selected={menuOpen} onPress={() => { setMenuOpen(true); }}
          accessibilityLabel={`Options for ${monthName}`} accessibilityState={{ expanded: menuOpen }} />
      </View>
    </View>
    {featured && (showPlanned || hasUnpaid) && <View className="flex-row flex-wrap gap-3 border-t border-border/60 pt-3">
      {showPlanned && <View className="min-w-[104px] flex-1 gap-0.5">
        <Text className="text-label-medium text-muted-foreground">Planned remaining</Text>
        <Text style={{ fontVariant: ["tabular-nums"] }} className={cn("text-base font-semibold", summary.remaining < 0 ? "text-destructive" : "text-foreground")}>{plannedBalance}</Text>
      </View>}
      {hasUnpaid && <View className="min-w-[104px] flex-1 gap-0.5">
        <Text className="text-label-medium text-muted-foreground">Unpaid bills</Text>
        <Text style={{ fontVariant: ["tabular-nums"] }} className="text-base font-semibold text-foreground">{formatCurrency(unpaid)}</Text>
      </View>}
    </View>}
    {featured && !hasUnpaid && <Text className="text-label-medium text-muted-foreground">No unpaid bills</Text>}
    {(featured || isExpanded) && summary.savingsGoal > 0 && <View className="gap-1.5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-[11px] text-muted-foreground">{`Savings target · ${formatCurrency(summary.savingsGoal)}`}</Text>
        {summary.goalMet && <View className="flex-row items-center gap-1"><CircleCheck size={13} color={colors.success} /><Text className="text-label-medium text-success">Target met</Text></View>}
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-secondary-container" accessible accessibilityRole="progressbar"
        accessibilityLabel="Monthly savings target" accessibilityValue={{ min: 0, max: 100, now: summary.goalProgress }}>
        <View className="h-full rounded-full bg-success" style={{ width: `${summary.goalProgress}%` }} />
      </View>
    </View>}
    {isExpanded && <View className="gap-2 border-t border-border pt-3">
      {details.map(detail => <View key={detail.label} className="flex-row flex-wrap justify-between gap-3">
        <Text className="shrink text-xs text-muted-foreground">{detail.label}</Text>
        <Text className={cn("text-xs font-semibold", detail.value < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(detail.value)}</Text>
      </View>)}
    </View>}
    {footer}
    <ActionDialog visible={menuOpen} title={monthName} onClose={() => setMenuOpen(false)} actions={[
      { key: "open", label: "Open budget", primary: true, onPress: onOpen },
      { key: "delete", label: "Delete",  onPress: () => { onDelete(); } },
    ]} />
  </Card>;
});
