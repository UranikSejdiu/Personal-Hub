import { Text, TextInput } from "../../src/components/ui/Typography";
import { useCallback, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { Plus, CreditCard } from "../../src/components/AppIcons";
import { RepaymentPlanCard, type RepaymentPlanCardInfo } from "../../src/components/RepaymentPlanCard";
import { Button } from "../../src/components/ui/Button";
import { NumberInput } from "../../src/components/NumberInput";
import { DatePicker } from "../../src/components/DatePicker";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { FormDialog } from "../../src/components/ui/FormDialog";
import { useThemeColors } from "../../src/lib/theme";
import { addMonths, currentMonth } from "../../src/lib/budget";
import { installmentEndMonth } from "../../src/lib/creditCards";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS } from "../../src/lib/calculations";
import { formatCurrency } from "../../src/lib/utils";
import { isValidRepaymentInput, listRepaymentPlans, removeRepaymentPlan, repaymentForMonth, saveRepaymentPlan, type RepaymentInput, type RepaymentKind, type RepaymentPlan } from "../../src/lib/repaymentPlans";

function emptyPlan(kind: RepaymentKind): RepaymentInput {
  return { kind, name: "", amount: 0, apr: 0, payment: 0, term: 0, monthsPaid: 0, startMonth: currentMonth() };
}

export default function LoansScreen() {
  const colors = useThemeColors();
  const [plans, setPlans] = useState<RepaymentPlan[]>([]);
  const [draft, setDraft] = useState<RepaymentInput | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [choosingMonth, setChoosingMonth] = useState(false);
  const [startMonthTouched, setStartMonthTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(new Set());
  const [discard, setDiscard] = useState(false);
  const initialDraft = useRef("");
  const operationRef = useRef(false);
  const readRequestRef = useRef(0);
  const listRef = useRef<FlatList<RepaymentPlan>>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    const request = ++readRequestRef.current;
    listRepaymentPlans().then((loadedPlans) => { if (active && request === readRequestRef.current) setPlans(loadedPlans); }).catch(() => { if (active && request === readRequestRef.current) toast.error("Failed to load data."); });
    return () => { active = false; };
  }, []));

  const start = (kind: RepaymentKind) => { if (operationRef.current) return; setInvalidFields(new Set()); setEditingId(null); setStartMonthTouched(false); const input = emptyPlan(kind); initialDraft.current = JSON.stringify(input); setDraft(input); listRef.current?.scrollToOffset({ offset: 0, animated: true }); };
  const edit = (plan: RepaymentPlan) => {
    if (operationRef.current) return;
    setInvalidFields(new Set());
    const { id, ...input } = plan;
    setEditingId(id);
    setStartMonthTouched(true);
    initialDraft.current = JSON.stringify(input);
    setDraft(input);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

  };
  const update = (change: Partial<RepaymentInput>) => {
    if (!operationRef.current) setDraft((old) => old ? { ...old, ...change } : null);
  };
  const setFieldValidity = (field: string, valid: boolean) => setInvalidFields(current => {
    if (current.has(field) === !valid) return current;
    const next = new Set(current);
    if (valid) next.delete(field); else next.add(field);
    return next;
  });
  const save = async () => {
    if (!draft || operationRef.current) return;
    if (invalidFields.size > 0 || !isValidRepaymentInput(draft)) { toast.error("Enter a name and a valid payment schedule."); return; }
    operationRef.current = true;
    readRequestRef.current++;
    setSaving(true);
    try {
      const saved = await saveRepaymentPlan(draft, editingId ?? undefined);
      setPlans((current) => [saved, ...current.filter((plan) => plan.id !== saved.id)].sort((a, b) => b.id - a.id));
      setDraft(null);
      setEditingId(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      toast.success("Payment plan saved");
    } catch {
      toast.error("Could not save the payment plan.");
    } finally { operationRef.current = false; setSaving(false); }
  };
  const remove = async () => {
    if (deletingId === null || operationRef.current) return;
    operationRef.current = true;
    readRequestRef.current++;
    setSaving(true);
    try {
      await removeRepaymentPlan(deletingId);
      setPlans((current) => current.filter((plan) => plan.id !== deletingId));
      if (editingId === deletingId) { setDraft(null); setEditingId(null); }
      setDeletingId(null);
      toast.success("Payment plan deleted");
    } catch { toast.error("Could not delete the payment plan."); }
    finally { operationRef.current = false; setSaving(false); }
  };

  const dismissDraft = () => { if (operationRef.current) return; setDraft(null); setEditingId(null); setChoosingMonth(false); setDiscard(false); };
  const closeDraft = () => {
    if (operationRef.current) return;
    if (draft && JSON.stringify(draft) !== initialDraft.current) setDiscard(true);
    else dismissDraft();
  };

  const draftPayment = draft && draft.term > 0 ? repaymentForMonth({ ...draft, id: editingId ?? 0 }, draft.startMonth) : 0;
  const draftEndMonth = draft ? installmentEndMonth(draft.startMonth, draft.term) : null;

  return <View className="flex-1 bg-background">
    <FlatList
      ref={listRef}
      data={plans}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="w-full max-w-md self-center gap-3 px-4 max-[360px]:px-3 pt-2 pb-6"
      ListHeaderComponent={<View className="gap-3">
        <Text accessibilityRole="header" className="text-title-large font-medium text-foreground">Payments</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button className="min-w-[116px] flex-1" disabled={saving} label="Add loan" icon={Plus} onPress={() => start("loan")} />
          <Button className="min-w-[116px] flex-1" disabled={saving} label="Add card" icon={CreditCard} variant="secondary" onPress={() => start("card")} />
        </View>
        {plans.length === 0 && !draft && <Text className="py-6 text-center text-sm text-muted-foreground">No loans or card payments yet.</Text>}
      </View>}
      renderItem={({ item }) => {
        const info: RepaymentPlanCardInfo = { kind: item.kind, name: item.name, payment: repaymentForMonth(item, item.startMonth), monthsPaid: item.monthsPaid, term: item.term, startMonth: item.startMonth, endMonth: item.endMonth ?? (item.unbounded ? null : installmentEndMonth(item.startMonth, item.term)) };
        return <RepaymentPlanCard info={info} onEdit={() => edit(item)} onDelete={() => { if (!operationRef.current) setDeletingId(item.id); }} />;
      }}
    />
    {draft && <FormDialog title={editingId === null ? draft.kind === "loan" ? "Add loan" : "Add card" : "Edit payment plan"} busy={saving} onClose={closeDraft}>
      <View pointerEvents={saving ? "none" : "auto"} accessibilityState={{ busy: saving }} className="gap-3">
          <View><Text className="mb-[7px] text-[13px] font-semibold text-foreground">Name</Text><TextInput value={draft.name} onChangeText={(name) => update({ name })} maxLength={100} placeholder="e.g. Car loan or phone payment" placeholderTextColor={colors.mutedForeground} className="min-h-[48px] rounded-lg border border-outline px-3 text-base focus:border-primary text-foreground" /></View>
          <Text className="text-sm text-muted-foreground">{draft.kind === "card" ? "Each installment is tracked separately and split evenly over the payment months." : "Enter a monthly payment, or an amount and interest rate to calculate one."}</Text>
          <View><Text className="mb-[7px] text-[13px] font-semibold text-foreground">{draft.kind === "card" ? "Total amount (€)" : "Loan Amount (€)"}</Text><NumberInput value={draft.amount} onValidityChange={(valid) => setFieldValidity("amount", valid)} onChange={(amount) => update({ amount })} decimals={2} min={0} max={MAX_LOAN_AMOUNT} placeholder="0.00" /></View>
          {(draft.kind === "loan" || draft.unbounded) && <>
            <View><Text className="mb-[7px] text-[13px] font-semibold text-foreground">Monthly Payment</Text><NumberInput value={draft.payment} onValidityChange={(valid) => setFieldValidity("payment", valid)} onChange={(payment) => update({ payment })} decimals={2} min={0} max={MAX_LOAN_AMOUNT} placeholder="0.00" /></View>
            {draft.kind === "loan" && <View><Text className="mb-[7px] text-[13px] font-semibold text-foreground">Interest Rate (%/yr)</Text><NumberInput value={draft.apr} onValidityChange={(valid) => setFieldValidity("apr", valid)} onChange={(apr) => update({ apr })} decimals={2} min={0} max={MAX_LOAN_ANNUAL_RATE} placeholder="0" /></View>}
          </>}
          <View><Text className="mb-[7px] text-[13px] font-semibold text-foreground">{draft.unbounded ? "Payment limit (optional)" : "Number of monthly payments"}</Text><NumberInput value={draft.term} onValidityChange={(valid) => setFieldValidity("term", valid)} onChange={(term) => update(draft.unbounded ? { term, endMonth: term > 0 ? installmentEndMonth(draft.startMonth, term) : null } : { term })} min={draft.unbounded ? 0 : 1} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /></View>
          {editingId === null && <View><Text className="mb-[7px] text-[13px] font-semibold text-foreground">Payments already made</Text><NumberInput value={draft.monthsPaid} onValidityChange={(valid) => setFieldValidity("monthsPaid", valid)} onChange={(monthsPaid) => update({ monthsPaid, ...(startMonthTouched ? {} : { startMonth: addMonths(currentMonth(), -monthsPaid) }) })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /><Text className="mt-1 text-xs text-muted-foreground">Count payments already made, including those before you started using the app.</Text></View>}
          <Pressable onPress={() => setChoosingMonth(true)} accessible accessibilityRole="button" accessibilityLabel="First payment month" className="min-h-[48px] justify-center rounded-lg border border-outline px-3 active:opacity-70"><Text className="text-sm text-foreground">First payment month: {draft.startMonth}</Text></Pressable>
          {draftPayment > 0 && <View className="gap-1 rounded-lg bg-muted p-3">
            <Text className="text-sm font-semibold text-foreground">Monthly Payment: {formatCurrency(draftPayment)}</Text>
            {draft.term > 0 ? <Text className="text-xs text-muted-foreground">{`${draft.monthsPaid} of ${draft.term} paid`} · {`${Math.max(0, draft.term - draft.monthsPaid)} payments remaining`}</Text> : <Text className="text-xs text-muted-foreground">{`${draft.monthsPaid} payments recorded`}</Text>}
            <Text className="text-xs text-muted-foreground">Last payment month: {draft.endMonth ?? (draft.unbounded ? "No end month" : draftEndMonth)}</Text>
          </View>}
          {editingId !== null && <Pressable onPress={() => setDeletingId(editingId)} disabled={saving} accessibilityRole="button" accessibilityLabel="Delete payment plan?" className="min-h-[44px] justify-center"><Text className="text-xs font-semibold text-destructive">Delete</Text></Pressable>}
          <View className="flex-row gap-2"><Button className="flex-1" label="Cancel" disabled={saving} variant="text" onPress={closeDraft} /><Button className="flex-1" label="Save" disabled={invalidFields.size > 0} busy={saving} onPress={() => { void save(); }} /></View>
      </View>
    </FormDialog>}
    <ConfirmDialog visible={discard} title="Discard changes?" message="Your changes to this payment plan have not been saved." confirmLabel="Discard changes" cancelLabel="Keep editing" onClose={() => setDiscard(false)} onConfirm={dismissDraft} />
    {draft && choosingMonth && <DatePicker mode="month" initialDisplay="current" value={draft.startMonth} onChange={(startMonth) => { if (startMonth) { update({ startMonth, ...(draft.unbounded && draft.term > 0 ? { endMonth: installmentEndMonth(startMonth, draft.term) } : {}) }); setStartMonthTouched(true); } }} onClose={() => setChoosingMonth(false)} />}
    <ConfirmDialog visible={deletingId !== null} title="Delete payment plan?" message="This removes the plan and its recorded monthly payments." destructive confirmLabel="Delete" onClose={() => setDeletingId(null)} onConfirm={remove} />
  </View>;
}
