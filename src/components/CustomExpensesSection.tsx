import { Text, TextInput } from "./ui/Typography";
import { memo, useState } from "react";
import { View, Pressable } from "react-native";
import { Plus, Trash2, Repeat, MoreHorizontal, Pencil } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { type Expense } from "../lib/budget";
import { formatCurrency, withAlpha } from "../lib/utils";
import { NumberInput } from "./NumberInput";
import { Checkbox } from "./ui/Checkbox";
import { Button, IconButton } from "./ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";

interface Props {
  expenses: Expense[];
  onAdd: () => void;
  onUpdate: (id: number, fields: Partial<Pick<Expense, "category" | "amount" | "paid" | "is_recurring">>) => void;
  onRemove: (id: number) => void;
  onToggleRecurring?: (expense: Expense, next: boolean) => void;
}

export function CustomExpensesHeader({ expenses, onAdd }: Pick<Props, "expenses" | "onAdd">) {
  const { t } = useI18n();
  return <View className="gap-2.5">
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">{t("sectionExpenses")}</Text>
      <Button icon={Plus} label={t("addRow")} onPress={onAdd} />
    </View>
    <View className="rounded-t-[14px] border-x border-t border-border/60 bg-card px-3 pt-3">
      {expenses.length === 0 ? <Text className="py-4 text-center text-xs text-muted-foreground">{t("addCategoryPlaceholder")}</Text> :
        <View className="flex-row items-center gap-1 pb-2">
          <Text className="w-9 text-center text-[10px] text-muted-foreground">{t("paid")}</Text>
          <Text className="min-w-0 flex-1 text-[10px] text-muted-foreground">{t("expenseName")}</Text>
          <Text className="w-[76px] text-right text-[10px] text-muted-foreground">{t("expenseAmount")}</Text>
          <View className="w-8" />
        </View>}
    </View>
  </View>;
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
    <View className={`py-2 ${isLast ? "" : "border-b border-border/60"}`}>
      <View className="min-h-[48px] flex-row items-center gap-1">
        <Checkbox
          checked={expense.paid}
          onPress={() => { void haptics.light(); onUpdate(expense.id, { paid: !expense.paid }); }}
          className="w-9 shrink-0" hitSlop={4}
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
            className="min-h-[44px] min-w-0 flex-1 justify-center gap-1 rounded-lg active:opacity-70"
            accessible accessibilityRole="button"
            accessibilityLabel={`${t("edit")}: ${expense.category || t("addCategoryPlaceholder")}`}
          >
            <Text className={`shrink text-sm font-medium ${expense.paid || !expense.category ? "text-muted-foreground" : "text-foreground"}`} numberOfLines={1}>
              {expense.category || t("addCategoryPlaceholder")}
            </Text>
            <View className="flex-row items-center gap-1">{expense.is_recurring ? <Repeat size={10} color={colors.mutedForeground} /> : <Pencil size={10} color={colors.mutedForeground} />}<Text className="text-[10px] text-muted-foreground">{t(expense.is_recurring ? "expenseRecurring" : "expenseTapToEdit")}</Text></View>
          </Pressable>
        )}

        {editing === "amount" ? <NumberInput autoFocus value={expense.amount}
          onChange={(value) => onUpdate(expense.id, { amount: value })} min={0} decimals={2} placeholder="0.00"
          onBlur={() => setEditing(null)} onSubmitEditing={() => setEditing(null)}
          accessibilityLabel={t("expenseEditAmount", { category: expense.category || t("category") })} className="w-[76px]" /> :
          <Pressable onPress={() => { close(); setEditing("amount"); }}
            className="min-h-[44px] w-[76px] shrink-0 items-end justify-center rounded-lg active:bg-muted"
            accessible accessibilityRole="button" accessibilityLabel={t("expenseEditAmount", { category: expense.category || t("category") })}>
            <Text className={`text-xs font-semibold ${expense.paid ? "text-muted-foreground" : "text-foreground"}`}>{formatCurrency(expense.amount)}</Text>
          </Pressable>}
        <View ref={triggerRef} collapsable={false}>
          <IconButton
            icon={MoreHorizontal}
            className="w-8" hitSlop={6}
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
