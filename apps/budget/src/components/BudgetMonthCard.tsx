import { Text } from "./ui/Typography";
import { memo, useState } from "react";
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
}

export const BudgetMonthCard = memo(function BudgetMonthCard({ summary, onOpen, onDelete,
  expanded, onToggleExpand, variant = "compact" }: BudgetMonthCardProps) {
  const colors = useThemeColors();
  const monthName = monthLabel(summary.month);
  const featured = variant === "featured";
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
  return <Card className={cn("p-3", featured && "border-0 bg-surface-container")}>
    <View className="flex-row items-center">
      <Pressable onPress={onOpen} className="min-h-[44px] min-w-0 flex-1 justify-center active:opacity-70"
        accessible accessibilityRole="button" accessibilityLabel={`Open budget for ${monthName}`}>
        <Text className={cn("font-semibold text-foreground", featured ? "text-base" : "text-body-medium")}>{monthName}</Text>
        <Text className="text-label-medium text-muted-foreground">Planned remaining</Text>
        <Text className={cn("font-semibold", featured ? "text-[24px]" : "text-base", summary.remaining < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(summary.remaining)}</Text>
      </Pressable>
      <IconButton icon={ChevronDown} className={isExpanded ? "rotate-180" : "rotate-0"}
        onPress={() => { handleToggle(); }}
        accessibilityLabel={isExpanded ? "Collapse" : "Expand"} accessibilityState={{ expanded: isExpanded }} />
      <View>
        <IconButton icon={MoreHorizontal} selected={menuOpen} onPress={() => { setMenuOpen(true); }}
          accessibilityLabel={`Options for ${monthName}`} accessibilityState={{ expanded: menuOpen }} />
      </View>
    </View>
    {featured && <>
      <View className="mt-2 flex-row flex-wrap gap-x-3 gap-y-2 border-t border-border/60 pt-2">
        <View className="min-w-[112px] flex-1"><Text className="text-[11px] text-muted-foreground">Current remaining</Text><Text className={cn("text-base font-semibold", summary.actualRemaining < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(summary.actualRemaining)}</Text></View>
        <View className="min-w-[112px] flex-1"><Text className="text-[11px] text-muted-foreground">Unpaid</Text><Text className="text-base font-semibold text-foreground">{formatCurrency(Math.max(0, summary.outflow - summary.savingsGoal - summary.actualOutflow))}</Text></View>
      </View>
    </>}
    {(featured || isExpanded) && summary.savingsGoal > 0 && <View className="mt-2 gap-1.5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-[11px] text-muted-foreground">{`Savings target · ${formatCurrency(summary.savingsGoal)}`}</Text>
        <View className="flex-row items-center gap-1"><CircleCheck size={13} color={summary.goalMet ? colors.success : colors.mutedForeground} /><Text className={cn("text-[11px]", summary.goalMet ? "text-success" : "text-muted-foreground")}>{summary.goalMet ? "Target met" : "In progress"}</Text></View>
      </View>
      <View className="h-[5px] overflow-hidden rounded-full bg-success/10" accessible accessibilityRole="progressbar"
        accessibilityLabel="Monthly savings target" accessibilityValue={{ min: 0, max: 100, now: summary.goalProgress }}>
        <View className="h-full rounded-full bg-success" style={{ width: `${summary.goalProgress}%` }} />
      </View>
    </View>}
    {isExpanded && <View className="mt-3 gap-[7px] border-t border-border/60 pt-2.5">
      {details.map(detail => <View key={detail.label} className="flex-row flex-wrap justify-between gap-3">
        <Text className="shrink text-xs text-muted-foreground">{detail.label}</Text>
        <Text className={cn("text-xs font-semibold", detail.value < 0 ? "text-destructive" : "text-foreground")}>{formatCurrency(detail.value)}</Text>
      </View>)}
    </View>}
    <ActionDialog visible={menuOpen} title={monthName} onClose={() => setMenuOpen(false)} actions={[
      { key: "open", label: "Open budget", primary: true, onPress: onOpen },
      { key: "delete", label: "Delete",  onPress: () => { onDelete(); } },
    ]} />
  </Card>;
});
