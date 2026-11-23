import { AppAlerts } from "./AppAlerts";
import { toast } from "sonner-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadBudget, loadSavingsGoal, type Budget } from "../lib/budget";
import { monthLabel } from "../lib/monthLabel";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import { parseNumberInput } from "../lib/numberInput";
import { Text, TextInput } from "./ui/Typography";
import { Button, IconButton } from "./ui/Button";
import { CalendarDays, X } from "./AppIcons";
import { ConfirmDialog } from "./ConfirmDialog";
import { DatePicker } from "./DatePicker";

export function BudgetMonthEditor({ initialMonth, budget, onSave, onClose }: {
  initialMonth: string;
  budget?: Budget;
  onSave: (month: string, income: number, goal: number) => Promise<void>;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(initialMonth);
  const [income, setIncome] = useState(String(budget?.income ?? 0));
  const [goal, setGoal] = useState(String(budget?.savings_goal ?? 0));
  const [loading, setLoading] = useState(!budget);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<{ message: string; retryLoad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [discard, setDiscard] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const initial = useRef(JSON.stringify([initialMonth, income, goal]));

  useEffect(() => {
    mounted.current = true;
    if (!budget) {
      void loadSavingsGoal().then((defaults) => {
        if (!mounted.current) return;
        setIncome(String(defaults.salary));
        setGoal(String(defaults.goal_amount));
        initial.current = JSON.stringify([initialMonth, String(defaults.salary), String(defaults.goal_amount)]);
        setLoading(false);
      }).catch(() => {
        if (mounted.current) { setError({ message: "Failed to load data.", retryLoad: true }); setLoading(false); }
      });
    }
    return () => { mounted.current = false; };
  }, [budget, initialMonth, loadAttempt]);

  const close = () => {
    if (busyRef.current) return;
    if (JSON.stringify([month, income, goal]) !== initial.current) setDiscard(true);
    else onClose();
  };
  const incomeValue = parseNumberInput(income, 2);
  const goalValue = parseNumberInput(goal, 2);
  const valid = [incomeValue, goalValue].every((value) => value !== null && value >= 0 && value <= Number.MAX_SAFE_INTEGER / 100);
  const save = async () => {
    if (busyRef.current || loading || error?.retryLoad || !valid || incomeValue === null || goalValue === null) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!budget && await loadBudget(month)) {
        const message = "This month already exists. Open it from Months to edit it.";
        if (mounted.current) setError({ message });
        toast.warning(message);
        return;
      }
      await onSave(month, incomeValue, goalValue);
    }
    catch { if (mounted.current) { const message = "Failed to save."; setError({ message }); toast.error(message); } }
    finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <>
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior="padding" automaticOffset className="flex-1" style={variables}>
        <Pressable onPress={close} accessible={false} className="flex-1 items-center justify-center bg-black/50 px-4"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={(event) => event.stopPropagation()} accessible={false} accessibilityViewIsModal
            className="max-h-full w-full max-w-md overflow-hidden rounded-[28px] bg-surface-container-high">
            <View className="flex-row items-center justify-between px-[18px] pt-2.5">
              <Text accessibilityRole="header" className="flex-1 text-[22px] font-semibold text-foreground">{budget ? "Edit month" : "New month"}</Text>
              <IconButton icon={X} accessibilityLabel="Cancel" disabled={busy} onPress={close} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 12 }}>
              {loading ? <ActivityIndicator color={colors.primary} /> : <>
                <Button variant="secondary" icon={CalendarDays} label={monthLabel(month)} disabled={!!budget || busy} onPress={() => setDatePicker(true)} />
                {([{ label: "Monthly Income (after tax)", value: income, change: setIncome }, { label: "Monthly Savings Target", value: goal, change: setGoal }]).map((field) =>
                  <View key={field.label} className="gap-2">
                    <Text className="text-sm font-semibold text-foreground">{field.label}</Text>
                    <TextInput accessibilityLabel={field.label} value={field.value} onChangeText={field.change} editable={!busy}
                      keyboardType="decimal-pad" selectTextOnFocus placeholder="0.00" placeholderTextColor={colors.mutedForeground}
                      className="min-h-[44px] rounded-[8px] border border-outline focus:border-primary px-3 text-base text-foreground" />
                  </View>)}
                <Text className="text-sm leading-5 text-muted-foreground">These values are remembered for new months until you change them. Other saved months keep their own income and savings target.</Text>
                {!valid ? <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">Enter valid, non-negative amounts with up to two decimal places.</Text> : null}
              </>}
              {error ? <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">{error.message}</Text> : null}
              {error?.retryLoad ? <Button label="Retry" onPress={() => { setLoading(true); setError(null); setLoadAttempt((attempt) => attempt + 1); }} /> : null}
              <View className="flex-row gap-2">
                <Button className="flex-1" variant="text" label="Cancel" disabled={busy} onPress={close} />
                <Button className="flex-1" label="Save" disabled={loading || !valid || error?.retryLoad} busy={busy} onPress={() => { void save(); }} />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <AppAlerts />
    </Modal>
    {datePicker ? <DatePicker mode="month" value={month} onChange={(value) => { if (value) setMonth(value); }} onClose={() => setDatePicker(false)} /> : null}
    <ConfirmDialog visible={discard} title="Discard changes?" message="Your changes to this month have not been saved."
      confirmLabel="Discard changes" onClose={() => setDiscard(false)} onConfirm={onClose} />
  </>;
}
