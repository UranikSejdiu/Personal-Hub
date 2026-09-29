import { memo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Trash2, ChevronDown } from "./AppIcons";
import { useI18n, monthLabelShort } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { formatCurrency, withAlpha } from "../lib/utils";
import type { MonthSummary } from "../types/budget";

interface BudgetMonthCardProps {
  summary: MonthSummary;
  onOpen: () => void;
  onDelete: () => void;
  /** Controlled expand state (used by the tutorial); the card manages its own otherwise. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export const BudgetMonthCard = memo(function BudgetMonthCard({
  summary,
  onOpen,
  onDelete,
  expanded,
  onToggleExpand,
}: BudgetMonthCardProps) {
  const { t, lang } = useI18n();
  const colors = useThemeColors();
  const monthLabel = monthLabelShort(lang, summary.month);
  const isNegative = summary.remaining < 0;

  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded ?? internalExpanded;
  const handleToggle = onToggleExpand ?? (() => setInternalExpanded((value) => !value));

  return (
    <View className="rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={monthLabel}
          >
            <Text className="font-medium text-foreground underline">{monthLabel}</Text>
          </Pressable>
          <Text className={`text-xs ${isNegative ? "text-destructive" : "text-muted-foreground"}`}>
            {formatCurrency(summary.remaining)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={handleToggle}
            className="h-6 w-6 items-center justify-center rounded-md transition-colors"
            accessibilityLabel={isExpanded ? t("collapse") : t("expand")}
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
          >
            <View style={isExpanded ? styles.rotated : undefined}>
              <ChevronDown
                size={16}
                color={isNegative ? colors.destructive : colors.mutedForeground}
              />
            </View>
          </Pressable>
          <Pressable
            onPress={onDelete}
            className="h-6 w-6 items-center justify-center rounded-md transition-colors"
            accessibilityLabel={t("delete")}
            accessibilityRole="button"
            android_ripple={{ color: withAlpha(colors.destructive, 0.125) }}
          >
            <Trash2 size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {isExpanded && (
        <View className="mt-2 gap-1">
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">{t("incomeColon")} </Text>
            <Text className="font-medium text-foreground">{formatCurrency(summary.income)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">{t("plannedColon")} </Text>
            <Text className="font-medium text-foreground">{formatCurrency(summary.outflow)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">{t("remainsColon")} </Text>
            <Text
              className={isNegative ? "text-destructive" : "font-medium text-foreground"}
            >
              {formatCurrency(summary.remaining)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">{t("paidColon")} </Text>
            <Text className="font-medium text-foreground">
              {formatCurrency(summary.actualOutflow)}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground">{t("actuallyRemainsColon")} </Text>
            <Text className="font-medium text-foreground">
              {formatCurrency(summary.actualRemaining)}
            </Text>
          </View>

          {summary.savingsGoal > 0 && (
            <View className="mt-1 gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted-foreground">{t("goalColon")}</Text>
                <Text className={summary.goalMet ? "text-success" : "font-medium text-foreground"}>
                  {formatCurrency(Math.max(0, summary.actualRemaining))} /{" "}
                  {formatCurrency(summary.savingsGoal)}
                </Text>
              </View>
              <View className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <View
                  className={summary.goalMet ? "bg-success" : "bg-primary"}
                  style={{ width: `${summary.goalProgress}%`, height: "100%" }}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  rotated: {
    transform: [{ rotate: "180deg" }],
  },
});
