import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { CreditCard, ChevronRight, Save } from "./AppIcons";
import { NumberInput } from "./NumberInput";
import { DatePicker } from "./DatePicker";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { creditCardPayoff, MAX_LOAN_AMOUNT, MAX_LOAN_TERM_MONTHS } from "../lib/calculations";
import { creditCardScheduledMonths, hasCreditCard, installmentEndMonth, installmentPayments, isCreditCardScheduleValid, type CreditCardDetails, type CreditCardSlot } from "../lib/creditCards";
import { formatCurrency } from "../lib/utils";
import { EditableDebtName } from "./EditableDebtName";
import { Button } from "./ui/Button";

interface Props {
  card: CreditCardDetails;
  slot: CreditCardSlot;
  onChange: (card: CreditCardDetails) => void;
  onSaveName: (name: string) => Promise<void>;
  onNameEditingChange?: (editing: boolean) => void;
  nameDisabled?: boolean;
  onSave: () => void;
  saving: boolean;
}

export function CreditCardForm({ card, slot, onChange, onSaveName, onNameEditingChange, nameDisabled, onSave, saving }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [editingMonth, setEditingMonth] = useState<"startMonth" | "endMonth" | null>(null);
  const [showSchedule, setShowSchedule] = useState(card.startMonth !== null || card.endMonth !== null);
  const [showDetails, setShowDetails] = useState(false);
  const [formMode, setFormMode] = useState<"installment" | "manual">(card.planMode === "installment" || !hasCreditCard(card) ? "installment" : "manual");
  const displayedInstallments = card.planMode === null && !hasCreditCard(card) && card.installments === 0 ? 12 : card.installments;
  const update = (fields: Partial<CreditCardDetails>) => onChange({ ...card, ...fields });
  const updateInstallment = (fields: Partial<CreditCardDetails>) => {
    const next = { ...card, installments: displayedInstallments, ...fields, planMode: "installment" as const, apr: 0 };
    const amounts = installmentPayments(next);
    onChange({ ...next, payment: amounts?.regular ?? 0, endMonth: next.startMonth ? installmentEndMonth(next.startMonth, next.installments) : null });
  };
  const selectMode = (mode: "installment" | "manual") => {
    if (mode === formMode) return;
    setFormMode(mode);
    onChange({ ...card, balance: 0, apr: 0, payment: 0, monthsPaid: 0, startMonth: null, endMonth: null, planMode: mode === "installment" ? "installment" : null, installments: mode === "installment" ? 12 : 0 });
  };
  const installmentAmounts = installmentPayments(card);
  const payoff = useMemo(() => card.balance > 0 && card.payment > 0 ? creditCardPayoff(card.balance, card.apr, card.payment) : null, [card.balance, card.apr, card.payment]);
  const isPaid = formMode === "installment" ? card.installments > 0 && card.monthsPaid >= card.installments : payoff !== null && Number.isFinite(payoff.months) && payoff.months > 0 && card.monthsPaid >= payoff.months;
  const scheduleValid = isCreditCardScheduleValid(card);
  const scheduledMonths = creditCardScheduledMonths(card);

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="mb-3 flex-row items-center gap-2">
        <CreditCard size={20} color={colors.foreground} />
        <EditableDebtName name={card.name} fallback={t(slot === 1 ? "ccSection" : "secondCreditCard")} label={t("ccName")} onSave={onSaveName} onEditingChange={onNameEditingChange} disabled={nameDisabled} />
      </View>
      <View className="gap-3">
        <View className="flex-row gap-2">
          {(["installment", "manual"] as const).map((mode) => <Pressable key={mode} onPress={() => selectMode(mode)} className={`min-h-[44px] flex-1 items-center justify-center rounded-lg border px-2 ${formMode === mode ? "border-primary bg-primary/10" : "border-border bg-background"} active:opacity-70`} accessibilityRole="button" accessibilityState={{ selected: formMode === mode }} accessibilityLabel={t(mode === "installment" ? "installmentPlan" : "manualCardPayment")}><Text className={`text-center text-sm font-medium ${formMode === mode ? "text-primary" : "text-foreground"}`}>{t(mode === "installment" ? "installmentPlan" : "manualCardPayment")}</Text></Pressable>)}
        </View>
        {formMode === "installment" ? <>
          <Text className="text-xs leading-5 text-muted-foreground">{t("installmentTotalHint")}</Text>
          <View><Text className="mb-1 text-sm text-muted-foreground">{t("totalToRepay")}</Text><NumberInput value={card.balance} onChange={(balance) => updateInstallment({ balance })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" /></View>
          <View className="flex-row gap-3">
            <View className="flex-1"><Text className="mb-1 text-sm text-muted-foreground">{t("totalPayments")}</Text><NumberInput value={displayedInstallments} onChange={(installments) => updateInstallment({ installments })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /></View>
            <View className="flex-1"><Text className="mb-1 text-sm text-muted-foreground">{t("paymentsAlreadyMade")}</Text><NumberInput value={card.monthsPaid} onChange={(monthsPaid) => updateInstallment({ monthsPaid })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" /></View>
          </View>
          <View><Text className="mb-1 text-sm text-muted-foreground">{t("firstPaymentMonth")}</Text><Pressable onPress={() => setEditingMonth("startMonth")} className="min-h-[44px] flex-row items-center justify-between rounded-lg border border-border bg-background px-3 active:opacity-70" accessibilityRole="button" accessibilityLabel={t("firstPaymentMonth")}><Text className="text-sm text-foreground">{card.startMonth ?? "—"}</Text><ChevronRight size={16} color={colors.mutedForeground} /></Pressable></View>
          {installmentAmounts && card.endMonth && <View className="gap-2 rounded-lg bg-muted p-3">
            <View className="flex-row justify-between"><Text className="text-sm text-muted-foreground">{t("lastPaymentMonth")}</Text><Text className="text-sm font-medium text-foreground">{card.endMonth}</Text></View>
            <View className="flex-row justify-between"><Text className="text-sm text-muted-foreground">{t("monthlyPayment")}</Text><Text className="text-sm font-medium text-foreground">{formatCurrency(installmentAmounts.regular)}</Text></View>
            {installmentAmounts.final !== installmentAmounts.regular && <View className="flex-row justify-between"><Text className="text-sm text-muted-foreground">{t("finalInstallment")}</Text><Text className="text-sm font-medium text-foreground">{formatCurrency(installmentAmounts.final)}</Text></View>}
          </View>}
        </> : <>
        <View>
          <Text className="mb-1 text-sm text-muted-foreground">{t("ccPayment")}</Text>
          <NumberInput value={card.payment} onChange={(payment) => update({ payment })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
        </View>
        <View>
          <Text className="mb-1 text-sm text-muted-foreground">{t("ccMonthsPaid")}</Text>
          <NumberInput value={card.monthsPaid} onChange={(monthsPaid) => update({ monthsPaid })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" />
        </View>
        <Pressable onPress={() => setShowSchedule((value) => !value)} className="min-h-[44px] flex-row items-center justify-between active:opacity-70" accessibilityRole="button" accessibilityLabel={t("paymentMonths")}>
          <Text className="text-sm font-medium text-primary">{t("paymentMonths")}</Text><ChevronRight size={16} color={colors.primary} />
        </Pressable>
        {showSchedule && <>
        {(["startMonth", "endMonth"] as const).map((field) => {
          const label = t(field === "startMonth" ? "creditCardStartMonth" : "creditCardEndMonth");
          const month = card[field];
          const value = month ? new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : t("creditCardAnyMonth");
          return (
            <View key={field}>
              <Text className="mb-1 text-sm text-muted-foreground">{label}</Text>
              <Pressable onPress={() => setEditingMonth(field)} accessible accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} className="min-h-[44px] flex-row items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 active:opacity-70">
                <Text className="flex-1 text-sm text-foreground">{value}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          );
        })}
        <Text className={`text-xs leading-5 ${scheduleValid ? "text-muted-foreground" : "text-destructive"}`}>{t(scheduleValid ? "creditCardScheduleHint" : "creditCardScheduleError")}</Text>
        {scheduledMonths !== null && <Text className="text-sm font-medium text-foreground">{t(scheduledMonths === 1 ? "creditCardScheduledPayment" : "creditCardScheduledPayments", { count: scheduledMonths })}</Text>}
        </>}
        <Pressable onPress={() => setShowDetails((value) => !value)} className="min-h-[44px] flex-row items-center justify-between active:opacity-70" accessibilityRole="button" accessibilityLabel={t("optionalDetails")}>
          <Text className="text-sm font-medium text-primary">{t("optionalDetails")}</Text><ChevronRight size={16} color={colors.primary} />
        </Pressable>
        {showDetails && <>
          <View>
            <Text className="mb-1 text-sm text-muted-foreground">{t("ccBalance")}</Text>
            <NumberInput value={card.balance} onChange={(balance) => update({ balance })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
          </View>
          <View>
            <Text className="mb-1 text-sm text-muted-foreground">{t("ccApr")}</Text>
            <NumberInput value={card.apr} onChange={(apr) => update({ apr })} min={0} decimals={2} placeholder="0" />
          </View>
        {payoff && (
          <View className="flex-row gap-2">
            <View className="flex-1 rounded-lg bg-muted p-2">
              <Text className="text-xs text-muted-foreground">{t("monthsToPayoff")}</Text>
              <Text className="font-medium text-foreground">{payoff.months === Infinity ? t("never") : String(payoff.months)}</Text>
            </View>
            <View className="flex-1 rounded-lg bg-muted p-2">
              <Text className="text-xs text-muted-foreground">{t("totalInterest")}</Text>
              <Text className="font-medium text-foreground">{payoff.totalInterest === Infinity ? "—" : formatCurrency(payoff.totalInterest)}</Text>
            </View>
          </View>
        )}
        </>}
        </>}
        {isPaid && <View className="rounded-lg bg-success/15 p-3"><Text className="text-center text-sm font-medium text-success">{t("cardFullyPaid")}</Text></View>}
        <Button label={t("saveCreditCard")} icon={Save} busy={saving} disabled={nameDisabled} onPress={onSave} />
      </View>
      {editingMonth && <DatePicker mode="month" value={card[editingMonth]} onChange={(value) => editingMonth === "startMonth" && formMode === "installment" ? updateInstallment({ startMonth: value }) : update({ [editingMonth]: value })} onClose={() => setEditingMonth(null)} />}
    </View>
  );
}
