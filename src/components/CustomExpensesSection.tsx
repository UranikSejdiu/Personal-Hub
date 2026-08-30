import { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Plus, Trash2, Copy, Check, Repeat } from "lucide-react-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { formatCurrency, type Expense } from "../lib/budget";
import { NumberInput } from "./NumberInput";

interface Props {
  expenses: Expense[];
  onAdd: () => void;
  onUpdate: (id: number, fields: Partial<Pick<Expense, "category" | "amount" | "paid" | "is_recurring">>) => void;
  onRemove: (id: number) => void;
  onToggleRecurring?: (expense: Expense, next: boolean) => void;
  onCopyPrevious?: () => void;
  previousMonthLabel?: string;
}

export function CustomExpensesSection({
  expenses,
  onAdd,
  onUpdate,
  onRemove,
  onToggleRecurring,
  onCopyPrevious,
  previousMonthLabel,
}: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [editingId, setEditingId] = useState<number | null>(null);
  const { total, paidTotal } = useMemo(
    () => ({
      total: expenses.reduce((sum, e) => sum + e.amount, 0),
      paidTotal: expenses.reduce((sum, e) => sum + (e.paid ? e.amount : 0), 0),
    }),
    [expenses]
  );

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Check size={20} color={colors.foreground} />
          <Text className="text-base font-semibold text-foreground">{t("sectionExpenses")}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {expenses.length === 0 && onCopyPrevious && previousMonthLabel && (
            <Pressable
              onPress={onCopyPrevious}
              className="flex-row items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5"
            >
               <Copy size={14} color={colors.foreground} />
               <Text className="text-xs text-foreground">{t("copyFromPreviousMonth")}</Text>
             </Pressable>
          )}
          <Pressable
            onPress={onAdd}
            className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5"
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
                onPress={onCopyPrevious}
                className="flex-row items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2"
              >
                 <Copy size={14} color={colors.foreground} />
                <Text className="text-sm text-foreground">{t("copyFromPreviousMonth")}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onAdd}
              className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-2"
            >
              <Plus size={14} color={colors.primaryForeground} />
              <Text className="text-sm font-medium text-primary-foreground">{t("addRow")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="gap-2">
          {expenses.map((expense) => (
            <View
              key={expense.id}
              className="rounded-lg bg-muted/40 p-2 gap-2"
            >
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => onUpdate(expense.id, { paid: !expense.paid })}
                  className={`h-6 w-6 items-center justify-center rounded-md border-2 shrink-0 ${
                    expense.paid
                      ? "border-primary bg-primary/15"
                      : "border-muted-foreground/50 bg-secondary"
                  }`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: expense.paid }}
                >
                  {expense.paid && <Check size={14} color={colors.primary} />}
                </Pressable>

                {editingId === expense.id ? (
                  <TextInput
                    autoFocus
                    value={expense.category}
                    onChangeText={(text) => onUpdate(expense.id, { category: text })}
                    onBlur={() => setEditingId(null)}
                    onSubmitEditing={() => setEditingId(null)}
                    placeholder={t("addCategoryPlaceholder")}
                    placeholderTextColor={colors.mutedForeground}
                    className="flex-1 border-b border-border bg-transparent px-1 text-sm font-medium text-foreground"
                  />
                ) : (
                  <Pressable
                    onPress={() => setEditingId(expense.id)}
                    className="flex-1"
                  >
                    <Text
                      className={`px-1 text-left text-sm font-medium ${
                        expense.paid ? "text-muted-foreground line-through" : "text-foreground"
                      } ${expense.category ? "" : "text-muted-foreground"}`}
                      numberOfLines={1}
                    >
                      {expense.category || t("addCategoryPlaceholder")}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => onRemove(expense.id)}
                  className="shrink-0 p-1"
                  accessibilityLabel={t("delete")}
                >
                  <Trash2 size={18} color={colors.destructive} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (onToggleRecurring) {
                      onToggleRecurring(expense, !expense.is_recurring);
                    } else {
                      onUpdate(expense.id, { is_recurring: !expense.is_recurring });
                    }
                  }}
                  className="shrink-0 p-1"
                  accessibilityLabel={t("recurringToggle")}
                >
                  <Repeat size={16} color={expense.is_recurring ? colors.foreground : colors.mutedForeground} />
                </Pressable>
              </View>

              <View className="pl-8">
                <NumberInput
                  value={expense.amount}
                  onChange={(v) => onUpdate(expense.id, { amount: v })}
                  min={0}
                  decimals={2}
                  placeholder="0.00"
                  className="text-right"
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <View className="mt-3 gap-1 rounded-lg bg-muted p-3">
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">{t("totalExpensesPlanned")}</Text>
          <Text className="text-sm font-medium text-foreground">{formatCurrency(total)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">{t("totalPaid")}</Text>
          <Text className="text-sm font-medium text-success">{formatCurrency(paidTotal)}</Text>
        </View>
      </View>
    </View>
  );
}
