import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect } from "expo-router";
import { Landmark, CreditCard, Save, ChevronDown, ChevronRight, Plus } from "../../src/components/AppIcons";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import {
  loadLoans,
  saveLoans,
  loanMonthlyPayment,
  saveDebtName,
  addMonths,
  currentMonth,
  type Loans,
  EMPTY_LOANS,
} from "../../src/lib/budget";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS, remainingBalance } from "../../src/lib/calculations";
import { formatCurrency, withAlpha } from "../../src/lib/utils";
import { NumberInput } from "../../src/components/NumberInput";
import { DatePicker } from "../../src/components/DatePicker";
import { useThemeColors } from "../../src/lib/theme";
import { CreditCardForm } from "../../src/components/CreditCardForm";
import { Button } from "../../src/components/ui/Button";
import { creditCardDetails, creditCardFields, creditCardScheduledMonths, hasCreditCard, isCreditCardScheduleValid, isCreditCardValid } from "../../src/lib/creditCards";
import { EditableDebtName } from "../../src/components/EditableDebtName";

export default function LoansScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [loans, setLoans] = useState<Loans>(EMPTY_LOANS);
  const [saved, setSaved] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [addingSecondCard, setAddingSecondCard] = useState(false);
  const [editing, setEditing] = useState<"loan" | 1 | 2 | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [planMode, setPlanMode] = useState<"count" | "dates">("count");
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [planChanged, setPlanChanged] = useState(false);
  const [editingMonth, setEditingMonth] = useState<"loan_start_month" | "loan_end_month" | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const nameSaveRef = useRef<Promise<void>>(Promise.resolve());
  const originalLoanRef = useRef<Loans>(EMPTY_LOANS);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadLoans()
        .then((l) => { if (!cancelled) setLoans(l); })
        .catch(() => { if (!cancelled) toast.error(t("errorLoadingData")); });
      return () => { cancelled = true; };
    }, [t])
  );

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    if (![creditCardDetails(loans, 1), creditCardDetails(loans, 2)].every(isCreditCardScheduleValid)) {
      toast.error(t("creditCardScheduleError"));
      return;
    }
    let toSave = loans;
    if (editing === "loan") {
      const total = planMode === "dates" && (planChanged || loans.loan_schedule_mode === "dates")
        ? creditCardScheduledMonths({ startMonth: loans.loan_start_month, endMonth: loans.loan_end_month }) : loans.loan_term;
      const payment = loans.loan_payment > 0 ? loans.loan_payment : loanMonthlyPayment({ ...loans, loan_term: total ?? 0 });
      if (payment <= 0 || total === null || total <= 0 || loans.loan_months_paid > total) {
        toast.error(t("loanPlanError"));
        return;
      }
      if (planMode === "dates" && (planChanged || loans.loan_schedule_mode === "dates")) {
        if (total === null || total > MAX_LOAN_TERM_MONTHS || loans.loan_months_paid > total) {
          toast.error(t("loanDateRangeError"));
          return;
        }
        toSave = { ...loans, loan_schedule_mode: "dates", loan_term: total };
      } else if (planChanged) {
        const original = originalLoanRef.current;
        const originalStart = original.loan_schedule_mode === "count" ? original.loan_start_month : null;
        const originalEnd = original.loan_schedule_mode === "count" ? original.loan_end_month : null;
        const start = originalStart && originalEnd ? originalStart : currentMonth();
        const end = originalStart && originalEnd
          ? addMonths(originalEnd, loans.loan_term - original.loan_term - (loans.loan_months_paid - original.loan_months_paid))
          : addMonths(start, Math.max(1, loans.loan_term - loans.loan_months_paid) - 1);
        toSave = { ...loans, loan_schedule_mode: "count", loan_start_month: start, loan_end_month: end < start ? start : end };
      }
    }
    if (editing === 2 && !hasCreditCard(creditCardDetails(toSave, 2))) {
      toSave = { ...toSave, ...creditCardFields(2, { ...creditCardDetails(EMPTY_LOANS, 2) }) };
    }
    if ((editing === 1 && !isCreditCardValid(creditCardDetails(toSave, 1))) ||
        (editing === 2 && hasCreditCard(creditCardDetails(toSave, 2)) && !isCreditCardValid(creditCardDetails(toSave, 2)))) {
      toast.error(t("installmentPlanError"));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await nameSaveRef.current;
      const savedNames = await loadLoans();
      toSave = { ...toSave, loan_name: savedNames.loan_name, cc_name: savedNames.cc_name, cc2_name: savedNames.cc2_name };
      await saveLoans(toSave);
      setLoans(await loadLoans());
      setEditing(null);
      if (editing === 2 && !hasCreditCard(creditCardDetails(toSave, 2))) setAddingSecondCard(false);
      void haptics.success();
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [loans, haptics, t, editing, planMode, planChanged]);

  const saveName = useCallback(async (slot: "loan" | 1 | 2, name: string) => {
    const operation = nameSaveRef.current.then(() => saveDebtName(slot, name));
    nameSaveRef.current = operation.catch(() => undefined);
    await operation;
    const key = slot === "loan" ? "loan_name" : slot === 1 ? "cc_name" : "cc2_name";
    setLoans((prev) => ({ ...prev, [key]: name }));
  }, []);

  const cancelEdit = useCallback(async () => {
    if (savingRef.current) return;
    try {
      await nameSaveRef.current;
      setLoans(await loadLoans());
      setEditing(null);
      setAddingSecondCard(false);
    } catch {
      toast.error(t("errorLoadingData"));
    }
  }, [t]);

  const update = useCallback((fields: Partial<Loans>) => {
    setLoans((prev) => ({ ...prev, ...fields }));
  }, []);

  const loanPayment = loanMonthlyPayment(loans);
  const hasLoan = loanPayment > 0;
  const openLoan = () => { originalLoanRef.current = loans; setPlanMode(loans.loan_schedule_mode ?? "count"); setPlanChanged(!hasLoan); setPlanPickerOpen(false); setAdvanced(false); setEditing("loan"); };

  const firstCard = creditCardDetails(loans, 1);
  const secondCard = creditCardDetails(loans, 2);
  const showSecondCard = addingSecondCard || hasCreditCard(secondCard);

  const isLoanPaid = loans.loan_term > 0 && loans.loan_months_paid >= loans.loan_term;
  const loanProgress = isLoanPaid
    ? 100
    : loans.loan_term > 0
      ? Math.round((loans.loan_months_paid / loans.loan_term) * 100)
      : 0;
  const loanBalance =
    loans.loan_amount > 0 && loans.loan_term > 0
      ? remainingBalance(loans.loan_amount, loans.loan_rate, loans.loan_term, loans.loan_months_paid, loans.loan_payment > 0 ? loans.loan_payment : undefined)
      : 0;
  const planTotal = planMode === "dates" ? creditCardScheduledMonths({ startMonth: loans.loan_start_month, endMonth: loans.loan_end_month }) : loans.loan_term;
  const plannedPayment = loans.loan_payment > 0 ? loans.loan_payment : loanMonthlyPayment({ ...loans, loan_term: planTotal ?? 0 });
  const plannedRemaining = Math.max(0, (planTotal ?? 0) - loans.loan_months_paid);

  const formatDate = useCallback((v: string | null) => {
    if (!v) return "—";
    const [y, m, d] = v.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <>
      <KeyboardAwareScrollView className="flex-1 bg-background" bottomOffset={16} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
      <View className="w-full max-w-md self-center gap-3 p-4 pb-28">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{t(editing === "loan" ? "editLoan" : editing !== null ? "editCreditCard" : "tabLoans")}</Text>
          {editing !== null && <Pressable onPress={() => { void cancelEdit(); }} disabled={saving || nameEditing} className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70" accessibilityRole="button" accessibilityLabel={t("cancel")}><Text className="text-sm font-medium text-primary">{t("cancel")}</Text></Pressable>}
        </View>

        {saved && (
          <View className="rounded-lg bg-success/15 p-3">
            <Text className="text-center text-sm font-medium text-success">{t("savedSuccess")}</Text>
          </View>
        )}

        {/* Loan Section */}
        {editing === null && <View className="rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <Landmark size={20} color={colors.foreground} />
            <EditableDebtName name={loans.loan_name} fallback={t("loanSection")} label={t("loanName")} onSave={(name) => saveName("loan", name)} onEditingChange={setNameEditing} disabled={editing !== null || saving} />
            <Pressable onPress={openLoan} disabled={saving || nameEditing} className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70" accessibilityRole="button" accessibilityLabel={t("editLoan")}><Text className="text-sm font-semibold text-primary">{t("edit")}</Text></Pressable>
          </View>
          {hasLoan ? <View className="mt-2 gap-1">
            <Text className="text-lg font-semibold text-foreground">{formatCurrency(loanPayment)} <Text className="text-sm font-normal text-muted-foreground">{t("perMonth")}</Text></Text>
            <View className="flex-row justify-between"><Text className="text-sm text-muted-foreground">{t("loanPaidOfTotal", { paid: loans.loan_months_paid, total: loans.loan_term })}</Text><Text className="text-sm text-muted-foreground">{t("monthsLeft", { count: Math.max(0, loans.loan_term - loans.loan_months_paid) })}</Text></View>
            <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, loanProgress)}%` }} /></View>
            {loans.loan_months_paid < loans.loan_term && <Text className="mt-1 text-xs text-muted-foreground">{t("nextPaymentNumber", { number: loans.loan_months_paid + 1 })}</Text>}
            {loans.loan_schedule_mode !== null && loans.loan_start_month && loans.loan_end_month && <Text className="text-xs text-muted-foreground">{loans.loan_start_month} – {loans.loan_end_month}</Text>}
          </View> : <Pressable onPress={openLoan} className="mt-2 min-h-[44px] justify-center active:opacity-70" accessibilityRole="button" accessibilityLabel={t("addLoan")}><Text className="text-sm font-medium text-primary">{t("addLoan")}</Text></Pressable>}
        </View>}
        {editing === "loan" && <View className="rounded-xl border border-border bg-card p-4">
          <View className="mb-3 flex-row items-center gap-2">
             <Landmark size={20} color={colors.foreground} />
            <EditableDebtName name={loans.loan_name} fallback={t("loanSection")} label={t("loanName")} onSave={(name) => saveName("loan", name)} onEditingChange={setNameEditing} disabled={saving} />
          </View>

          <View className="gap-3">
            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("monthlyPayment")}</Text>
              <NumberInput value={Math.round(plannedPayment * 100) / 100} onChange={(v) => update({ loan_payment: v })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
            </View>
            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("paymentPlan")}</Text>
              <Pressable onPress={() => setPlanPickerOpen((value) => !value)} className="min-h-[44px] flex-row items-center justify-between rounded-lg border border-border bg-background px-3 active:opacity-70" accessibilityRole="button" accessibilityState={{ expanded: planPickerOpen }} accessibilityLabel={t("paymentPlan")}><Text className="text-sm text-foreground">{t(planMode === "count" ? "numberOfPayments" : "firstLastPaymentMonth")}</Text><ChevronDown size={16} color={colors.mutedForeground} /></Pressable>
              {planPickerOpen && <View className="mt-1 overflow-hidden rounded-lg border border-border bg-card">{(["count", "dates"] as const).map((mode) => <Pressable key={mode} onPress={() => { setPlanMode(mode); setPlanChanged(true); setPlanPickerOpen(false); }} className="min-h-[44px] justify-center px-3 active:bg-muted" accessibilityRole="button" accessibilityLabel={t(mode === "count" ? "numberOfPayments" : "firstLastPaymentMonth")}><Text className={planMode === mode ? "text-sm font-medium text-primary" : "text-sm text-foreground"}>{t(mode === "count" ? "numberOfPayments" : "firstLastPaymentMonth")}</Text></Pressable>)}</View>}
            </View>
            {planMode === "count" ? <View className="flex-row gap-3"><View className="flex-1">
              <Text className="mb-1 text-sm text-muted-foreground">{t("totalPayments")}</Text>
              <NumberInput value={loans.loan_term} onChange={(v) => { update({ loan_term: v }); if (loans.loan_schedule_mode !== null) setPlanChanged(true); }} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" />
            </View><View className="flex-1"><Text className="mb-1 text-sm text-muted-foreground">{t("paymentsAlreadyMade")}</Text><NumberInput value={loans.loan_months_paid} onChange={(v) => { update({ loan_months_paid: v }); if (loans.loan_schedule_mode === "count") setPlanChanged(true); }} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /></View></View> : <>
              {(["loan_start_month", "loan_end_month"] as const).map((field) => <View key={field}>
                <Text className="mb-1 text-sm text-muted-foreground">{t(field === "loan_start_month" ? "firstPaymentMonth" : "lastPaymentMonth")}</Text>
                <Pressable onPress={() => setEditingMonth(field)} className="min-h-[44px] flex-row items-center justify-between rounded-lg border border-border bg-background px-3 active:opacity-70" accessibilityRole="button" accessibilityLabel={t(field === "loan_start_month" ? "firstPaymentMonth" : "lastPaymentMonth")}><Text className="text-sm text-foreground">{loans[field] || "—"}</Text><ChevronRight size={16} color={colors.mutedForeground} /></Pressable>
              </View>)}
              <Text className="text-sm text-muted-foreground">{t("inclusivePaymentMonths")}</Text>
              <View><Text className="mb-1 text-sm text-muted-foreground">{t("paymentsAlreadyMade")}</Text><NumberInput value={loans.loan_months_paid} onChange={(v) => update({ loan_months_paid: v })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /></View>
            </>}
            {planTotal !== null && planTotal > 0 && <View className="gap-2 rounded-lg bg-muted p-3">
              <View className="flex-row justify-between"><Text className="text-xs text-muted-foreground">{t("loanPaidOfTotal", { paid: loans.loan_months_paid, total: planTotal })}</Text><Text className="text-xs text-muted-foreground">{t("monthsLeft", { count: plannedRemaining })}</Text></View>
              <View className="h-1.5 overflow-hidden rounded-full bg-secondary"><View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((loans.loan_months_paid / planTotal) * 100))}%` }} /></View>
              <View className="flex-row justify-between"><Text className="text-xs text-muted-foreground">{t("nextPayment")}</Text><Text className="text-xs font-medium text-foreground">#{Math.min(planTotal, loans.loan_months_paid + 1)} · {formatCurrency(plannedPayment)}</Text></View>
              <View className="flex-row justify-between"><Text className="text-xs text-muted-foreground">{t("scheduledPaymentsLeft")}</Text><Text className="text-xs font-medium text-foreground">{formatCurrency(plannedPayment * plannedRemaining)}</Text></View>
            </View>}
            <Pressable onPress={() => setAdvanced((value) => !value)} className="min-h-[44px] flex-row items-center justify-between border-t border-border active:opacity-70" accessibilityRole="button" accessibilityLabel={t("interestPayoffDetails")}><Text className="text-sm font-medium text-foreground">{t("interestPayoffDetails")}</Text><View className="flex-row items-center gap-3"><Text className="text-xs text-muted-foreground">{t("optional")}</Text><Text className="text-sm text-muted-foreground">{advanced ? "−" : "+"}</Text></View></Pressable>
            {advanced && <>
            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("loanAmount")}</Text>
               <NumberInput value={loans.loan_amount} onChange={(v) => update({ loan_amount: v })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanRate")}</Text>
                <NumberInput value={loans.loan_rate} onChange={(v) => update({ loan_rate: v })} min={0} max={MAX_LOAN_ANNUAL_RATE} decimals={2} placeholder="0" />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanPaymentDay")}</Text>
                <NumberInput value={loans.loan_payment_day} onChange={(v) => update({ loan_payment_day: v })} min={1} max={31} placeholder="1" />
              </View>
            </View>

            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("loanStartDate")}</Text>
              <Pressable
                onPress={() => setDatePickerVisible(true)}
                className="flex-row items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
                accessibilityRole="button"
                accessibilityLabel={t("loanStartDate")}
              >
                <Text className="text-sm text-foreground">{formatDate(loans.loan_start_date)}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {loans.loan_amount > 0 && <View className="flex-row justify-between"><Text className="text-sm text-muted-foreground">{t("remainingBalanceLabel")}</Text><Text className="text-sm font-medium text-foreground">{formatCurrency(loanBalance)}</Text></View>}
            </>}
            {isLoanPaid && (
              <View className="rounded-lg bg-success/15 p-3">
                <Text className="text-center text-sm font-medium text-success">{t("loanFullyPaid")}</Text>
              </View>
            )}
            <Button label={t("saveLoan")} icon={Save} busy={saving} disabled={nameEditing} onPress={() => { void handleSave(); }} />
          </View>
        </View>}

        {editing === 1 && <CreditCardForm card={firstCard} slot={1} onChange={(card) => update(creditCardFields(1, card))} onSaveName={(name) => saveName(1, name)} onNameEditingChange={setNameEditing} nameDisabled={saving || nameEditing} onSave={() => { void handleSave(); }} saving={saving} />}
        {editing === null && <View className="rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <CreditCard size={18} color={colors.foreground} />
            <EditableDebtName name={firstCard.name} fallback={t("ccSection")} label={t("ccName")} onSave={(name) => saveName(1, name)} onEditingChange={setNameEditing} disabled={saving} />
            <Pressable onPress={() => setEditing(1)} disabled={saving || nameEditing} className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70" accessibilityRole="button" accessibilityLabel={t("editCreditCard")}><Text className="text-sm font-semibold text-primary">{t("edit")}</Text></Pressable>
          </View>
          {hasCreditCard(firstCard) ? <View className="mt-1 gap-2"><Text className="text-lg font-semibold text-foreground">{formatCurrency(firstCard.payment)} <Text className="text-sm font-normal text-muted-foreground">{t("perMonth")}</Text></Text><Text className="text-xs text-muted-foreground">{firstCard.planMode === "installment" ? t("loanPaidOfTotal", { paid: firstCard.monthsPaid, total: firstCard.installments }) : t("paymentsRecorded", { count: firstCard.monthsPaid })}{firstCard.planMode === "installment" && firstCard.startMonth && firstCard.endMonth ? ` · ${firstCard.startMonth} – ${firstCard.endMonth}` : !firstCard.endMonth ? ` · ${t("noEndMonth")}` : ""}</Text></View> : <Pressable onPress={() => setEditing(1)} className="min-h-[44px] justify-center active:opacity-70" accessibilityRole="button" accessibilityLabel={t("setUpCreditCard")}><Text className="text-sm font-medium text-primary">{t("setUpCreditCard")}</Text></Pressable>}
        </View>}
        {editing === 2 && <CreditCardForm card={secondCard} slot={2} onChange={(card) => update(creditCardFields(2, card))} onSaveName={(name) => saveName(2, name)} onNameEditingChange={setNameEditing} nameDisabled={saving || nameEditing} onSave={() => { void handleSave(); }} saving={saving} />}
        {editing === null && (showSecondCard ? <View className="rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-2">
            <CreditCard size={18} color={colors.foreground} />
            <EditableDebtName name={secondCard.name} fallback={t("secondCreditCard")} label={t("ccName")} onSave={(name) => saveName(2, name)} onEditingChange={setNameEditing} disabled={saving} />
            <Pressable onPress={() => setEditing(2)} disabled={saving || nameEditing} className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70" accessibilityRole="button" accessibilityLabel={t("editCreditCard")}><Text className="text-sm font-semibold text-primary">{t("edit")}</Text></Pressable>
          </View>
          <View className="mt-1 gap-2"><Text className="text-lg font-semibold text-foreground">{formatCurrency(secondCard.payment)} <Text className="text-sm font-normal text-muted-foreground">{t("perMonth")}</Text></Text><Text className="text-xs text-muted-foreground">{secondCard.planMode === "installment" ? t("loanPaidOfTotal", { paid: secondCard.monthsPaid, total: secondCard.installments }) : t("paymentsRecorded", { count: secondCard.monthsPaid })}{secondCard.planMode === "installment" && secondCard.startMonth && secondCard.endMonth ? ` · ${secondCard.startMonth} – ${secondCard.endMonth}` : ""}</Text></View>
        </View> : <Button label={t("addSecondCreditCard")} icon={Plus} variant="secondary" disabled={saving} onPress={() => { void haptics.light(); setAddingSecondCard(true); setEditing(2); }} />)}
      </View>
    </KeyboardAwareScrollView>

      {datePickerVisible && (
        <DatePicker
          value={loans.loan_start_date}
          onChange={(d) => update({ loan_start_date: d })}
          onClose={() => setDatePickerVisible(false)}
        />
      )}
      {editingMonth && <DatePicker mode="month" value={loans[editingMonth]} onChange={(value) => update({ [editingMonth]: value })} onClose={() => setEditingMonth(null)} />}
    </>
  );
}
