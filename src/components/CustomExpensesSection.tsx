import { memo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Plus, Trash2, Copy, Check, Repeat, MoreHorizontal } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { type Expense } from "../lib/budget";
import { formatCurrency, withAlpha } from "../lib/utils";
import { NumberInput } from "./NumberInput";
import { Checkbox } from "./ui/Checkbox";
import { Button, IconButton } from "./ui/Button";

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
    <View className="rounded-t-2xl border border-b-0 border-border bg-card p-4">
      <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3">
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
        <View className="items-center rounded-lg border border-dashed border-border p-6">
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
      ) : null}
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
  const [menuOpen, setMenuOpen] = useState(false);

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
            onPress={() => { setMenuOpen(false); setEditing("category"); }}
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

        <Pressable
          onPress={() => { setMenuOpen(false); setEditing(editing === "amount" ? null : "amount"); }}
          className="min-h-[44px] shrink-0 justify-center rounded-lg px-2 active:bg-muted"
          accessible accessibilityRole="button"
          accessibilityLabel={t("expenseEditAmount", { category: expense.category || t("category") })}
          accessibilityState={{ expanded: editing === "amount" }}
        >
          <Text className={`text-sm font-semibold ${expense.paid ? "text-muted-foreground" : "text-foreground"}`}>
            {formatCurrency(expense.amount)}
          </Text>
        </Pressable>
        <IconButton
          icon={MoreHorizontal}
          selected={menuOpen}
          onPress={() => { void haptics.light(); setEditing(null); setMenuOpen((open) => !open); }}
          accessibilityLabel={t("expenseOptions", { category: expense.category || t("category") })}
          accessibilityState={{ expanded: menuOpen }}
        />
      </View>

      {editing === "amount" && (
        <View className="flex-row items-center gap-2 pb-2 pl-11">
          <NumberInput
            value={expense.amount}
            onChange={(value) => onUpdate(expense.id, { amount: value })}
            min={0}
            decimals={2}
            placeholder="0.00"
            accessibilityLabel={t("expenseEditAmount", { category: expense.category || t("category") })}
            className="flex-1"
          />
          <IconButton icon={Check} onPress={() => setEditing(null)} accessibilityLabel={t("save")} />
        </View>
      )}

      {menuOpen && (
        <View className="flex-row flex-wrap gap-2 pb-2 pl-11">
          <Button
            label={t("recurringToggle")}
            icon={Repeat}
            variant="secondary"
            accessibilityState={{ selected: expense.is_recurring }}
            className={expense.is_recurring ? "border border-primary" : undefined}
            onPress={() => {
              void haptics.light();
              setMenuOpen(false);
              if (onToggleRecurring) onToggleRecurring(expense, !expense.is_recurring);
              else onUpdate(expense.id, { is_recurring: !expense.is_recurring });
            }}
          />
          <Button
            label={t("delete")}
            icon={Trash2}
            variant="destructive"
            onPress={() => { void haptics.warning(); setMenuOpen(false); onRemove(expense.id); }}
          />
        </View>
      )}
    </View>
  );
});
