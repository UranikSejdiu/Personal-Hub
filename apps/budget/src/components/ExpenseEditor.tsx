import { useEffect, useRef, useState } from "react";
import { toast } from "sonner-native";
import { Pressable, View, type TextInputInstance } from "react-native";
import type { Expense, ExpenseDraft } from "../lib/budget";
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
  const colors = useThemeColors();
  const [category, setCategory] = useState(expense?.category ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const amountInput = useRef<TextInputInstance>(null);
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
    catch { if (mounted.current) { setError(true); toast.error("Failed to update expense."); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };
  const inputClass = "min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground";
  return <>
    <FormDialog title={expense ? "Edit expense" : "Add expense"} busy={busy} onClose={close}>
      <View className="gap-[7px]"><Text className="text-[13px] font-semibold text-foreground">Amount (€)</Text>
        <TextInput ref={amountInput} value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" selectTextOnFocus autoFocus={!expense}
          accessibilityLabel="Amount" placeholder="0.00" placeholderTextColor={colors.mutedForeground} className={inputClass} />
      </View>
      <View className="gap-[7px]"><Text className="text-[13px] font-semibold text-foreground">Expense</Text>
        <TextInput value={category} onChangeText={setCategory} editable={!busy} maxLength={100}
          accessibilityLabel="Expense" placeholderTextColor={colors.mutedForeground} className={inputClass} />
      </View>
      {!expense && <View className="flex-row flex-wrap gap-2">
        {(["Groceries", "Transport", "Bills", "Other"] as const).map(category => <Pressable key={category} disabled={busy} onPress={() => setCategory(category)} accessibilityRole="button" accessibilityLabel={category} className="min-h-[44px] justify-center rounded-full bg-secondary px-3"><Text className="text-xs font-medium text-primary">{category}</Text></Pressable>)}
      </View>}
      <Checkbox checked={paid} disabled={busy} onPress={() => setPaid(value => !value)} accessibilityLabel="Paid off">
        <Text className="text-sm text-foreground">Paid off</Text>
      </Checkbox>
      <Checkbox checked={recurring} disabled={busy} onPress={() => setRecurring(value => !value)} accessibilityLabel="Recurring">
        <Text className="text-sm text-foreground">Recurring</Text>
      </Checkbox>
      {!valid && <Text className="text-xs text-muted-foreground">Enter an expense name and a valid, non-negative amount.</Text>}
      {error && <Text accessibilityRole="alert" className="text-xs text-destructive">Failed to update expense.</Text>}
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        {expense && onDelete && <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityLabel="Delete expense?" className="mr-auto min-h-[44px] justify-center"><Text className="text-xs font-semibold text-destructive">Delete</Text></Pressable>}
        <Button variant="secondary" label="Cancel" disabled={busy} onPress={close} />
        {!expense && <Button variant="secondary" label={"Save & add another"} disabled={!valid || busy} onPress={() => { void save(true); }} />}
        <Button label="Save" disabled={!valid} busy={busy} onPress={() => { void save(); }} />
      </View>
    </FormDialog>
    <ConfirmDialog visible={discard} title="Discard changes?" message="Your changes to this expense have not been saved." confirmLabel="Discard changes" cancelLabel="Keep editing" onClose={() => setDiscard(false)} onConfirm={onClose} />
  </>;
}
