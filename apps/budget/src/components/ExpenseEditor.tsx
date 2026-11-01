import { useEffect, useRef, useState } from "react";
import { toast } from "sonner-native";
import { Pressable, View, type TextInput as NativeTextInput } from "react-native";
import type { Expense, ExpenseDraft } from "../lib/budget";
import { useI18n } from "../lib/i18n";
import { parseNumberInput } from "../lib/numberInput";
import { useThemeColors } from "../lib/theme";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { FormDialog } from "./ui/FormDialog";
import { Text, TextInput } from "./ui/Typography";

export function ExpenseEditor({ expense, onSave, onClose, onDelete }: {
  expense?: Expense; onSave: (fields: ExpenseDraft, id?: number, keepOpen?: boolean) => Promise<void>; onClose: () => void; onDelete?: () => void;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [category, setCategory] = useState(expense?.category ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const amountInput = useRef<NativeTextInput>(null);
  const focusAfterSave = useRef(false);
  const [paid, setPaid] = useState(expense?.paid ?? false);
  const [recurring, setRecurring] = useState(expense?.is_recurring ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [discard, setDiscard] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const initial = useRef(JSON.stringify([category, amount, paid, recurring]));
  useEffect(() => {
    if (!busy && focusAfterSave.current) {
      focusAfterSave.current = false;
      amountInput.current?.focus();
    }
  }, [busy]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => {
    if (busyRef.current) return;
    if (JSON.stringify([category, amount, paid, recurring]) !== initial.current) setDiscard(true);
    else onClose();
  };
  const value = parseNumberInput(amount, 2);
  const valid = !!category.trim() && value !== null && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 100;
  const save = async (keepOpen = false) => {
    if (busyRef.current || !valid || value === null) return;
    busyRef.current = true; setBusy(true); setError(false);
    try {
      await onSave({ category: category.trim(), amount: value, paid, is_recurring: recurring }, expense?.id, keepOpen);
      if (keepOpen && mounted.current) {
        setCategory(""); setAmount(""); setPaid(false); setRecurring(false);
        initial.current = JSON.stringify(["", "", false, false]);
        focusAfterSave.current = true;
      }
    }
    catch { if (mounted.current) { setError(true); toast.error(t("errorUpdatingExpense")); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const inputClass = "min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground";
  return <>
    <FormDialog title={t(expense ? "expenseEdit" : "addRow")} busy={busy} onClose={close}>
      <View className="gap-[7px]"><Text className="text-[13px] font-semibold text-foreground">{t("expenseAmount")} (€)</Text>
        <TextInput ref={amountInput} value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" selectTextOnFocus autoFocus={!expense}
          accessibilityLabel={t("expenseAmount")} placeholder="0.00" placeholderTextColor={colors.mutedForeground} className={inputClass} />
      </View>
      <View className="gap-[7px]"><Text className="text-[13px] font-semibold text-foreground">{t("expenseName")}</Text>
        <TextInput value={category} onChangeText={setCategory} editable={!busy} maxLength={100}
          accessibilityLabel={t("expenseName")} placeholderTextColor={colors.mutedForeground} className={inputClass} />
      </View>
      {!expense && <View className="flex-row flex-wrap gap-2">
        {(["suggestionGroceries", "suggestionTransport", "suggestionBills", "suggestionOther"] as const).map(key => <Pressable key={key} disabled={busy} onPress={() => setCategory(t(key))} accessibilityRole="button" accessibilityLabel={t(key)} className="min-h-[44px] justify-center rounded-full bg-secondary px-3"><Text className="text-xs font-medium text-primary">{t(key)}</Text></Pressable>)}
      </View>}
      <Checkbox checked={paid} disabled={busy} onPress={() => setPaid(value => !value)} accessibilityLabel={t("paid")}>
        <Text className="text-sm text-foreground">{t("paid")}</Text>
      </Checkbox>
      <Checkbox checked={recurring} disabled={busy} onPress={() => setRecurring(value => !value)} accessibilityLabel={t("expenseRecurring")}>
        <Text className="text-sm text-foreground">{t("expenseRecurring")}</Text>
      </Checkbox>
      {!valid && <Text className="text-xs text-muted-foreground">{t("expenseInvalid")}</Text>}
      {error && <Text accessibilityRole="alert" className="text-xs text-destructive">{t("errorUpdatingExpense")}</Text>}
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        {expense && onDelete && <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityLabel={t("expenseDeleteTitle")} className="mr-auto min-h-[44px] justify-center"><Text className="text-xs font-semibold text-destructive">{t("delete")}</Text></Pressable>}
        <Button variant="secondary" label={t("cancel")} disabled={busy} onPress={close} />
        {!expense && <Button variant="secondary" label={t("saveAndAddAnother")} disabled={!valid || busy} onPress={() => { void save(true); }} />}
        <Button label={t("save")} disabled={!valid} busy={busy} onPress={() => { void save(); }} />
      </View>
    </FormDialog>
    <ConfirmDialog visible={discard} title={t("discardChangesTitle")} message={t("expenseDiscard")} confirmLabel={t("discard")} cancelLabel={t("keepEditing")} onClose={() => setDiscard(false)} onConfirm={onClose} />
  </>;
}
