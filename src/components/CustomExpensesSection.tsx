import { Text, TextInput } from "./ui/Typography";
import { memo, useState } from "react";
import { View, Pressable } from "react-native";
import { Plus, Trash2, Copy, Check, Repeat, MoreHorizontal } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { type Expense } from "../lib/budget";
import { formatCurrency, withAlpha } from "../lib/utils";
import { NumberInput } from "./NumberInput";
import { Checkbox } from "./ui/Checkbox";
import { IconButton } from "./ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";

interface Props {
  expenses: Expense[];
  onAdd: () => void;
  onUpdate: (id: number, fields: Partial<Pick<Expense, "category" | "amount" | "paid" | "is_recurring">>) => void;
  onRemove: (id: number) => void;
  onToggleRecurring?: (expense: Expense, next: boolean) => void;
  onCopyPrevious?: () => void;
  previousMonthLabel?: string;
}

export function CustomExpensesHeader({ expenses, onAdd, onCopyPrevious, previousMonthLabel }: Pick<Props, "expenses" | "onAdd" | "onCopyPrevious" | "previousMonthLabel">) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  return (
    <View className="rounded-t-2xl border border-b-0 border-border bg-card p-3">
      <View className="mb-3 flex-row flex-wrap items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <Check size={20} color={colors.foreground} />
          <Text className="text-base font-semibold text-foreground">{t("sectionExpenses")}</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {expenses.length === 0 && onCopyPrevious && previousMonthLabel && (
            <Pressable
              onPress={() => { void haptics.light(); onCopyPrevious(); }}
              className="min-h-[44px] flex-row items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5"
              android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
              accessible accessibilityRole="button"
              accessibilityLabel={t("copyFromPreviousMonth")}
            >
               <Copy size={14} color={colors.foreground} />
               <Text className="text-xs text-foreground">{t("copyFromPreviousMonth")}</Text>
             </Pressable>
          )}
          <Pressable
            onPress={() => { void haptics.light(); onAdd(); }}
            className="min-h-[44px] flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5"
            android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
            accessible accessibilityRole="button"
            accessibilityLabel={t("addRow")}
          >
            <Plus size={14} color={colors.primaryForeground} />
            <Text className="text-xs font-medium text-primary-foreground">{t("addRow")}</Text>
          </Pressable>
        </View>
      </View>

      {expenses.length === 0 ? (
        <View className="items-center rounded-lg border border-dashed border-border p-4">
          <Text className="mb-3 text-center text-sm text-muted-foreground">
            {previousMonthLabel && onCopyPrevious
              ? t("copyFromPreviousMonthDesc", { month: previousMonthLabel })
              : t("addCategoryPlaceholder")}
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            {onCopyPrevious && previousMonthLabel && (
              <Pressable
                onPress={() => { void haptics.light(); onCopyPrevious(); }}
                className="min-h-[44px] flex-row items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2"
                android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                accessible accessibilityRole="button"
                accessibilityLabel={t("copyFromPreviousMonth")}
              >
                 <Copy size={14} color={colors.foreground} />
                <Text className="text-sm text-foreground">{t("copyFromPreviousMonth")}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => { void haptics.light(); onAdd(); }}
              className="min-h-[44px] flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-2"
              android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
              accessible accessibilityRole="button"
              accessibilityLabel={t("addRow")}
            >
              <Plus size={14} color={colors.primaryForeground} />
              <Text className="text-sm font-medium text-primary-foreground">{t("addRow")}</Text>
            </Pressable>
          </View>
        </View>
      ) : <View className="flex-row items-center gap-1 border-t border-border/50 pt-2">
        <Text className="w-11 text-center text-[11px] text-muted-foreground">{t("paid")}</Text>
        <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t("category")}</Text>
        <Text className="w-[96px] text-right text-[11px] text-muted-foreground">{t("expenseAmount")}</Text>
        <View className="w-11" />
      </View>}
    </View>
  );
}

export const CustomExpenseRow = memo(function CustomExpenseRow({ expense, isLast = false, onUpdate, onRemove, onToggleRecurring }: {
  expense: Expense;
  isLast?: boolean;
} & Pick<Props, "onUpdate" | "onRemove" | "onToggleRecurring">) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [editing, setEditing] = useState<"category" | "amount" | null>(null);
  const { triggerRef, anchor, open, close } = useAnchoredMenu();

  return (
    <View className={`py-1 ${isLast ? "" : "border-b border-border/50"}`}>
      <View className="min-h-[44px] flex-row items-center gap-1">
        <Checkbox
          checked={expense.paid}
          onPress={() => { void haptics.light(); onUpdate(expense.id, { paid: !expense.paid }); }}
          className="shrink-0"
          accessibilityLabel={`${t("paid")}: ${expense.category || t("addCategoryPlaceholder")}`}
          android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
        />

        {editing === "category" ? (
          <TextInput
            autoFocus
            value={expense.category}
            onChangeText={(text) => onUpdate(expense.id, { category: text })}
            onBlur={() => setEditing(null)}
            onSubmitEditing={() => setEditing(null)}
            accessibilityLabel={t("category")}
            placeholder={t("addCategoryPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            className="min-h-[44px] min-w-0 flex-1 border-b border-primary px-1 text-sm font-medium text-foreground"
          />
        ) : (
          <Pressable
            onPress={() => { close(); setEditing("category"); }}
            className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-1.5 rounded-lg active:opacity-70"
            accessible accessibilityRole="button"
            accessibilityLabel={`${t("edit")}: ${expense.category || t("addCategoryPlaceholder")}`}
          >
            <Text className={`shrink text-sm font-medium ${expense.paid || !expense.category ? "text-muted-foreground" : "text-foreground"}`} numberOfLines={1}>
              {expense.category || t("addCategoryPlaceholder")}
            </Text>
            {expense.is_recurring && <Repeat size={12} color={colors.mutedForeground} />}
          </Pressable>
        )}

        {editing === "amount" ? <NumberInput autoFocus value={expense.amount}
          onChange={(value) => onUpdate(expense.id, { amount: value })} min={0} decimals={2} placeholder="0.00"
          onBlur={() => setEditing(null)} onSubmitEditing={() => setEditing(null)}
          accessibilityLabel={t("expenseEditAmount", { category: expense.category || t("category") })} className="w-[112px]" /> :
          <Pressable onPress={() => { close(); setEditing("amount"); }}
            className="min-h-[44px] shrink-0 justify-center rounded-lg px-2 active:bg-muted"
            accessible accessibilityRole="button" accessibilityLabel={t("expenseEditAmount", { category: expense.category || t("category") })}>
            <Text className={`text-sm font-semibold ${expense.paid ? "text-muted-foreground" : "text-foreground"}`}>{formatCurrency(expense.amount)}</Text>
          </Pressable>}
        <View ref={triggerRef} collapsable={false}>
          <IconButton
            icon={MoreHorizontal}
            selected={anchor !== null}
            onPress={() => { void haptics.light(); setEditing(null); open(); }}
            accessibilityLabel={t("expenseOptions", { category: expense.category || t("category") })}
            accessibilityState={{ expanded: anchor !== null }}
          />
        </View>
      </View>

      <AnchoredMenu anchor={anchor} onClose={close} items={[
        { key: "recurring", label: t("recurringToggle"), icon: Repeat, selected: expense.is_recurring,
          onPress: () => {
            void haptics.light();
            if (onToggleRecurring) onToggleRecurring(expense, !expense.is_recurring);
            else onUpdate(expense.id, { is_recurring: !expense.is_recurring });
          } },
        { key: "delete", label: t("delete"), icon: Trash2, destructive: true,
          onPress: () => { void haptics.warning(); onRemove(expense.id); } },
      ]} />
    </View>
  );
});
