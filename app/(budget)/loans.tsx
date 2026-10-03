import { useCallback, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { Plus, Landmark, CreditCard } from "../../src/components/AppIcons";
import { RepaymentPlanCard, type RepaymentPlanCardInfo } from "../../src/components/RepaymentPlanCard";
import { Button } from "../../src/components/ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "../../src/components/ui/AnchoredMenu";
import { NumberInput } from "../../src/components/NumberInput";
import { DatePicker } from "../../src/components/DatePicker";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { useI18n } from "../../src/lib/i18n";
import { useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { addMonths, currentMonth } from "../../src/lib/budget";
import { installmentEndMonth } from "../../src/lib/creditCards";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS } from "../../src/lib/calculations";
import { formatCurrency } from "../../src/lib/utils";
import { isValidRepaymentInput, listRepaymentPlans, removeRepaymentPlan, repaymentForMonth, saveRepaymentPlan, type RepaymentInput, type RepaymentKind, type RepaymentPlan } from "../../src/lib/repaymentPlans";

function emptyPlan(kind: RepaymentKind): RepaymentInput {
  return { kind, name: "", amount: 0, apr: 0, payment: 0, term: 0, monthsPaid: 0, startMonth: currentMonth() };
}

export default function LoansScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [plans, setPlans] = useState<RepaymentPlan[]>([]);
  const [draft, setDraft] = useState<RepaymentInput | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [choosingMonth, setChoosingMonth] = useState(false);
  const [startMonthTouched, setStartMonthTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const operationRef = useRef(false);
  const readRequestRef = useRef(0);
  const listRef = useRef<FlatList<RepaymentPlan>>(null);
  const { triggerRef: addButtonRef, anchor: addMenuAnchor, open: openAddMenu, close: closeAddMenu } = useAnchoredMenu();

  useFocusEffect(useCallback(() => {
    let active = true;
    const request = ++readRequestRef.current;
    listRepaymentPlans().then((loadedPlans) => { if (active && request === readRequestRef.current) setPlans(loadedPlans); }).catch(() => { if (active && request === readRequestRef.current) toast.error(t("errorLoadingData")); });
    return () => { active = false; };
  }, [t]));

  const start = (kind: RepaymentKind) => { if (operationRef.current) return; setEditingId(null); setStartMonthTouched(false); setDraft(emptyPlan(kind)); listRef.current?.scrollToOffset({ offset: 0, animated: true }); void haptics.light(); };
  const edit = (plan: RepaymentPlan) => {
    if (operationRef.current) return;
    const { id, ...input } = plan;
    setEditingId(id);
    setStartMonthTouched(true);
    setDraft(input);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    void haptics.light();
  };
  const update = (change: Partial<RepaymentInput>) => {
    if (!operationRef.current) setDraft((old) => old ? { ...old, ...change } : null);
  };
  const save = async () => {
    if (!draft || operationRef.current) return;
    if (!isValidRepaymentInput(draft)) { toast.error(t("paymentPlanInvalid")); return; }
    operationRef.current = true;
    readRequestRef.current++;
    setSaving(true);
    try {
      const saved = await saveRepaymentPlan(draft, editingId ?? undefined);
      setPlans((current) => [saved, ...current.filter((plan) => plan.id !== saved.id)].sort((a, b) => b.id - a.id));
      setDraft(null);
      setEditingId(null);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      void haptics.success();
    } catch {
      toast.error(t("paymentPlanSaveFailed"));
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
      void haptics.success();
    } catch { toast.error(t("paymentPlanDeleteFailed")); }
    finally { operationRef.current = false; setSaving(false); }
  };

  const draftPayment = draft && draft.term > 0 ? repaymentForMonth({ ...draft, id: editingId ?? 0 }, draft.startMonth) : 0;
  const draftEndMonth = draft ? installmentEndMonth(draft.startMonth, draft.term) : null;

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background">
    <FlatList
      ref={listRef}
      data={plans}
      keyExtractor={(item) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="w-full max-w-md self-center gap-3 px-4 pt-3 pb-28"
      ListHeaderComponent={<View className="gap-3">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-xl font-bold text-foreground">{t("tabLoans")}</Text>
          <View ref={addButtonRef} collapsable={false}>
            <Button disabled={saving} label={t("addPaymentPlan")} icon={Plus} variant="secondary"
              onPress={() => { void haptics.light(); openAddMenu(); }}
              accessibilityState={{ expanded: addMenuAnchor !== null }} />
          </View>
        </View>
        {draft && <View pointerEvents={saving ? "none" : "auto"} accessibilityState={{ busy: saving }} className="gap-3 rounded-xl border border-border bg-card p-3">
          <Text className="text-base font-semibold text-foreground">{editingId === null ? t("addPaymentPlan") : t("edit")}</Text>
          <View><Text className="mb-1 text-sm text-muted-foreground">{t("paymentPlanName")}</Text><TextInput value={draft.name} onChangeText={(name) => update({ name })} maxLength={100} placeholder={t("paymentPlanNamePlaceholder")} placeholderTextColor={colors.mutedForeground} className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-base text-foreground" /></View>
          <Text className="text-sm text-muted-foreground">{t(draft.kind === "card" ? "paymentPlanCardHint" : "paymentPlanLoanHint")}</Text>
          <View><Text className="mb-1 text-sm text-muted-foreground">{t(draft.kind === "card" ? "paymentPlanTotal" : "loanAmount")}</Text><NumberInput value={draft.amount} onChange={(amount) => update({ amount })} decimals={2} min={0} max={MAX_LOAN_AMOUNT} placeholder="0.00" /></View>
          {(draft.kind === "loan" || draft.unbounded) && <>
            <View><Text className="mb-1 text-sm text-muted-foreground">{t("monthlyPayment")}</Text><NumberInput value={draft.payment} onChange={(payment) => update({ payment })} decimals={2} min={0} max={MAX_LOAN_AMOUNT} placeholder="0.00" /></View>
            {draft.kind === "loan" && <View><Text className="mb-1 text-sm text-muted-foreground">{t("loanRate")}</Text><NumberInput value={draft.apr} onChange={(apr) => update({ apr })} decimals={2} min={0} max={MAX_LOAN_ANNUAL_RATE} placeholder="0" /></View>}
          </>}
          <View><Text className="mb-1 text-sm text-muted-foreground">{t(draft.unbounded ? "paymentLimitOptional" : "paymentPlanCount")}</Text><NumberInput value={draft.term} onChange={(term) => update(draft.unbounded ? { term, endMonth: term > 0 ? installmentEndMonth(draft.startMonth, term) : null } : { term })} min={draft.unbounded ? 0 : 1} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /></View>
          {editingId === null && <View><Text className="mb-1 text-sm text-muted-foreground">{t("paymentsAlreadyMade")}</Text><NumberInput value={draft.monthsPaid} onChange={(monthsPaid) => update({ monthsPaid, ...(startMonthTouched ? {} : { startMonth: addMonths(currentMonth(), -monthsPaid) }) })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /><Text className="mt-1 text-xs text-muted-foreground">{t("paymentsAlreadyMadeHint")}</Text></View>}
          <Pressable onPress={() => setChoosingMonth(true)} accessible accessibilityRole="button" accessibilityLabel={t("paymentPlanFirstMonth")} className="min-h-[44px] justify-center rounded-xl border border-border bg-background px-3 active:opacity-70"><Text className="text-sm text-foreground">{t("paymentPlanFirstMonth")}: {draft.startMonth}</Text></Pressable>
          {draftPayment > 0 && <View className="gap-1 rounded-lg bg-muted p-3">
            <Text className="text-sm font-semibold text-foreground">{t("monthlyPayment")}: {formatCurrency(draftPayment)}</Text>
            {draft.term > 0 ? <Text className="text-xs text-muted-foreground">{t("loanPaidOfTotal", { paid: draft.monthsPaid, total: draft.term })} · {t("paymentsRemaining", { count: Math.max(0, draft.term - draft.monthsPaid) })}</Text> : <Text className="text-xs text-muted-foreground">{t("paymentsRecorded", { count: draft.monthsPaid })}</Text>}
            <Text className="text-xs text-muted-foreground">{t("lastPaymentMonth")}: {draft.endMonth ?? (draft.unbounded ? t("noEndMonth") : draftEndMonth)}</Text>
          </View>}
          <View className="flex-row gap-2"><Button className="flex-1" label={t("cancel")} disabled={saving} variant="secondary" onPress={() => { setDraft(null); setEditingId(null); }} /><Button className="flex-1" label={t("save")} busy={saving} onPress={() => { void save(); }} /></View>
        </View>}
        {plans.length === 0 && !draft && <Text className="py-6 text-center text-sm text-muted-foreground">{t("paymentPlanEmpty")}</Text>}
      </View>}
      renderItem={({ item }) => {
        const info: RepaymentPlanCardInfo = { kind: item.kind, name: item.name, payment: repaymentForMonth(item, item.startMonth), monthsPaid: item.monthsPaid, term: item.term, startMonth: item.startMonth, endMonth: item.endMonth ?? (item.unbounded ? null : installmentEndMonth(item.startMonth, item.term)) };
        return <RepaymentPlanCard info={info} onEdit={() => edit(item)} onDelete={() => { if (!operationRef.current) setDeletingId(item.id); }} />;
      }}
    />
    <AnchoredMenu anchor={addMenuAnchor} onClose={closeAddMenu} items={[
      { key: "loan", label: t("addLoanPlan"), icon: Landmark, onPress: () => start("loan") },
      { key: "card", label: t("addCardInstallment"), icon: CreditCard, onPress: () => start("card") },
    ]} />
    {draft && choosingMonth && <DatePicker mode="month" initialDisplay="current" value={draft.startMonth} onChange={(startMonth) => { if (startMonth) { update({ startMonth, ...(draft.unbounded && draft.term > 0 ? { endMonth: installmentEndMonth(startMonth, draft.term) } : {}) }); setStartMonthTouched(true); } }} onClose={() => setChoosingMonth(false)} />}
    <ConfirmDialog visible={deletingId !== null} title={t("paymentPlanDeleteTitle")} message={t("paymentPlanDeleteMessage")} destructive confirmLabel={t("delete")} onClose={() => setDeletingId(null)} onConfirm={remove} />
  </KeyboardAvoidingView>;
}
