import { Text, TextInput } from "./ui/Typography";
import { memo, useState } from "react";
import { View, Pressable } from "react-native";
import { Plus, Trash2, Repeat, MoreHorizontal, Copy } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
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
  onEdit?: (expense: Expense) => void;
  onToggleRecurring?: (expense: Expense, next: boolean) => void;
}

export function CustomExpensesHeader({ expenses, onAdd, onCopy }: Pick<Props, "expenses" | "onAdd"> & { onCopy?: () => void }) {
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const unpaid = expenses.reduce((sum, expense) => expense.paid ? sum : sum + expense.amount, 0);
  return <View className="gap-2.5">
    <View className="flex-row flex-wrap items-center justify-between gap-x-2">
      <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-2">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Expenses</Text>
        {expenses.length > 0 && <Text className="text-label-medium text-muted-foreground">{`${formatCurrency(unpaid)} unpaid`}</Text>}
      </View>
      <View ref={triggerRef} collapsable={false}>
        <Button icon={Plus} label="Add expense" onPress={onCopy ? open : onAdd}
          accessibilityState={onCopy ? { expanded: anchor !== null } : undefined} />
      </View>
    </View>
    {expenses.length === 0 && <View className="rounded-[24px] border border-border bg-surface px-4 py-3">
      <Text className="text-body-medium text-muted-foreground">No expenses</Text>
    </View>}
    {onCopy && <AnchoredMenu anchor={anchor} onClose={close} size="regular" items={[
      { key: "new", label: "New expense", icon: Plus, onPress: onAdd },
      { key: "copy", label: "Copy from previous month", icon: Copy, onPress: onCopy },
    ]} />}
  </View>;
}

export const CustomExpenseRow = memo(function CustomExpenseRow({ expense, isLast = false, onUpdate, onRemove, onToggleRecurring, onEdit }: {
  expense: Expense;
  isLast?: boolean;
} & Pick<Props, "onUpdate" | "onRemove" | "onToggleRecurring" | "onEdit">) {
  const colors = useThemeColors();
  const [editing, setEditing] = useState<"category" | "amount" | null>(null);
  const { triggerRef, anchor, open, close } = useAnchoredMenu();

  return (
    <View className={`py-1 ${isLast ? "" : "border-b border-border/60"}`}>
      <View className="min-h-[48px] flex-row items-center gap-1">
        <Checkbox
          checked={expense.paid}
          onPress={() => { onUpdate(expense.id, { paid: !expense.paid }); }}
          className="shrink-0"
          accessibilityLabel={`Paid: ${expense.category || "Add category…"}`}
          android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
        />

        {editing === "category" ? (
          <TextInput
            autoFocus
            value={expense.category}
            onChangeText={(text) => onUpdate(expense.id, { category: text })}
            onBlur={() => setEditing(null)}
            onSubmitEditing={() => setEditing(null)}
            accessibilityLabel="Category"
            placeholder="Add category…"
            placeholderTextColor={colors.mutedForeground}
            className="min-h-[44px] min-w-0 flex-1 border-b border-primary px-1 text-sm font-medium text-foreground"
          />
        ) : (
          <Pressable
            onPress={() => { close(); setEditing("category"); }}
            className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-1.5 rounded-lg active:opacity-70"
            accessible accessibilityRole="button"
            accessibilityLabel={`Edit ${expense.category || "category"}${expense.is_recurring ? ", recurring" : ""}`}
          >
            <Text className={`shrink text-sm font-medium ${expense.paid || !expense.category ? "text-muted-foreground" : "text-foreground"}`}>
              {expense.category || "Add category…"}
            </Text>
            {expense.is_recurring && <View className="shrink-0" accessible={false} importantForAccessibility="no-hide-descendants">
              <Repeat size={13} color={colors.mutedForeground} />
            </View>}
          </Pressable>
        )}

        {editing === "amount" ? <NumberInput autoFocus value={expense.amount}
          onChange={(value) => onUpdate(expense.id, { amount: value })} min={0} decimals={2} placeholder="0.00"
          onBlur={() => setEditing(null)} onSubmitEditing={() => setEditing(null)}
          accessibilityLabel={`Edit amount for ${expense.category || "Category"}`} className="w-[84px] max-[360px]:w-[72px]" /> :
          <Pressable onPress={() => { close(); setEditing("amount"); }}
            className="min-h-[44px] w-[84px] max-[360px]:w-[72px] shrink-0 items-end justify-center rounded-lg active:bg-muted"
            accessible accessibilityRole="button" accessibilityLabel={`Edit amount for ${expense.category || "Category"}`}>
            <Text className={`text-right text-body-medium ${expense.paid ? "text-muted-foreground" : "font-semibold text-foreground"}`}>{formatCurrency(expense.amount)}</Text>
          </Pressable>}
        <View ref={triggerRef} collapsable={false}>
          <IconButton
            icon={MoreHorizontal}
            selected={anchor !== null}
            onPress={() => { setEditing(null); if (onEdit) onEdit(expense); else open(); }}
            accessibilityLabel={`Options for ${expense.category || "Category"}`}
            accessibilityState={{ expanded: anchor !== null }}
          />
        </View>
      </View>

      <AnchoredMenu anchor={anchor} onClose={close} items={[
        { key: "recurring", label: "Recurring", icon: Repeat, selected: expense.is_recurring,
          onPress: () => {

            if (onToggleRecurring) onToggleRecurring(expense, !expense.is_recurring);
            else onUpdate(expense.id, { is_recurring: !expense.is_recurring });
          } },
        { key: "delete", label: "Delete", icon: Trash2, destructive: true,
          onPress: () => { onRemove(expense.id); } },
      ]} />
    </View>
  );
});
