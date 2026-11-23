import { Text, TextInput } from "./ui/Typography";
import { memo, useState } from "react";
import { View, Pressable } from "react-native";
import { Plus, Trash2, Repeat, MoreHorizontal } from "./AppIcons";
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

export function CustomExpensesHeader({ expenses, onAdd }: Pick<Props, "expenses" | "onAdd">) {
  return <View className="gap-2.5">
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">Expenses</Text>
      <Button icon={Plus} label="Add expense" onPress={onAdd} />
    </View>
    <View className="rounded-t-[14px] border-x border-t border-border/60 bg-card px-3 pt-3">
      {expenses.length === 0 ? <Text className="py-4 text-center text-xs text-muted-foreground">Add category…</Text> :
        <View className="flex-row items-center gap-1 pb-2">
          <Text className="w-9 max-[360px]:w-7 text-center text-[10px] text-muted-foreground">Paid off</Text>
          <Text className="min-w-0 flex-1 text-[10px] text-muted-foreground">Expense</Text>
          <Text className="w-[76px] max-[360px]:w-[65px] text-right text-[10px] text-muted-foreground">Amount</Text>
          <View className="w-8 max-[360px]:w-7" />
        </View>}
    </View>
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
    <View className={`py-2 ${isLast ? "" : "border-b border-border/60"}`}>
      <View className="min-h-[48px] flex-row items-center gap-1">
        <Checkbox
          checked={expense.paid}
          onPress={() => { onUpdate(expense.id, { paid: !expense.paid }); }}
          className="w-9 max-[360px]:w-7 shrink-0" hitSlop={4}
          accessibilityLabel={`Paid off: ${expense.category || "Add category…"}`}
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
            className="min-h-[44px] min-w-0 flex-1 justify-center gap-1 rounded-lg active:opacity-70"
            accessible accessibilityRole="button"
            accessibilityLabel={`Edit: ${expense.category || "Add category…"}`}
          >
            <Text className={`shrink text-sm font-medium ${expense.paid || !expense.category ? "text-muted-foreground" : "text-foreground"}`} numberOfLines={1}>
              {expense.category || "Add category…"}
            </Text>
            {expense.is_recurring && <View className="flex-row items-center gap-1">
              <Repeat size={12} color={colors.mutedForeground} /><Text className="text-xs text-muted-foreground">Recurring</Text>
            </View>}
          </Pressable>
        )}

        {editing === "amount" ? <NumberInput autoFocus value={expense.amount}
          onChange={(value) => onUpdate(expense.id, { amount: value })} min={0} decimals={2} placeholder="0.00"
          onBlur={() => setEditing(null)} onSubmitEditing={() => setEditing(null)}
          accessibilityLabel={`Edit amount for ${expense.category || "Category"}`} className="w-[76px] max-[360px]:w-[65px]" /> :
          <Pressable onPress={() => { close(); setEditing("amount"); }}
            className="min-h-[44px] w-[76px] max-[360px]:w-[65px] shrink-0 items-end justify-center rounded-lg active:bg-muted"
            accessible accessibilityRole="button" accessibilityLabel={`Edit amount for ${expense.category || "Category"}`}>
            <Text className={`text-sm font-semibold ${expense.paid ? "text-muted-foreground" : "text-foreground"}`}>{formatCurrency(expense.amount).replace("€", "")}</Text>
          </Pressable>}
        <View ref={triggerRef} collapsable={false}>
          <IconButton
            icon={MoreHorizontal}
            className="w-8 max-[360px]:w-7" hitSlop={6}
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
