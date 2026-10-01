import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect } from "expo-router";
import { Landmark, Save, ChevronRight, Plus } from "../../src/components/AppIcons";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import {
  loadLoans,
  saveLoans,
  loanMonthlyPayment,
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
import { creditCardDetails, creditCardFields, hasCreditCard, isCreditCardScheduleValid } from "../../src/lib/creditCards";

export default function LoansScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [loans, setLoans] = useState<Loans>(EMPTY_LOANS);
  const [saved, setSaved] = useState(false);
  const [addingSecondCard, setAddingSecondCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
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
    savingRef.current = true;
    setSaving(true);
    try {
      await saveLoans(loans);
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
  }, [loans, haptics, t]);

  const update = useCallback((fields: Partial<Loans>) => {
    setLoans((prev) => ({ ...prev, ...fields }));
  }, []);

  const loanPayment = loanMonthlyPayment(loans);

  const firstCard = creditCardDetails(loans, 1);
  const secondCard = creditCardDetails(loans, 2);
  const showSecondCard = addingSecondCard || hasCreditCard(secondCard) || secondCard.name.length > 0 || secondCard.monthsPaid > 0 || secondCard.startMonth !== null || secondCard.endMonth !== null;

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
          <Text className="text-xl font-bold text-foreground">{t("tabLoans")}</Text>
          <Button label={t("save")} icon={Save} busy={saving} onPress={() => { void handleSave(); }} />
        </View>

        {saved && (
          <View className="rounded-lg bg-success/15 p-3">
            <Text className="text-center text-sm font-medium text-success">{t("savedSuccess")}</Text>
          </View>
        )}

        {/* Loan Section */}
        <View className="rounded-xl border border-border bg-card p-4">
          <View className="mb-3 flex-row items-center gap-2">
             <Landmark size={20} color={colors.foreground} />
            <Text className="text-base font-semibold text-foreground">{t("loanSection")}</Text>
          </View>

          <View className="gap-3">
            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("loanName")}</Text>
              <TextInput
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={loans.loan_name}
                onChangeText={(v) => update({ loan_name: v })}
                placeholder={t("loanNamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

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
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanTerm")}</Text>
                <NumberInput value={loans.loan_term} onChange={(v) => update({ loan_term: v })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanMonthsPaid")}</Text>
                <NumberInput value={loans.loan_months_paid} onChange={(v) => update({ loan_months_paid: v })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanPaymentDay")}</Text>
                <NumberInput value={loans.loan_payment_day} onChange={(v) => update({ loan_payment_day: v })} min={1} max={31} placeholder="1" />
              </View>
            </View>

            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("optionalPayment")}</Text>
              <NumberInput value={loans.loan_payment} onChange={(v) => update({ loan_payment: v })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
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

            {loanPayment > 0 && (
              <View className="rounded-lg bg-muted p-3 gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted-foreground">{t("monthlyPayment")}</Text>
                  <Text className="text-sm font-medium text-foreground">{formatCurrency(loanPayment)}</Text>
                </View>
                {!isLoanPaid && (
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-muted-foreground">{t("remainingBalanceLabel")}</Text>
                    <Text className="text-sm font-medium text-foreground">{formatCurrency(loanBalance)}</Text>
                  </View>
                )}
                <View className="flex-row justify-between">
                  <Text className="text-sm text-muted-foreground">{t("progress")}</Text>
                  <Text className="text-sm font-medium text-foreground">{loanProgress}%</Text>
                </View>
                <View className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <View
                    className={`h-full rounded-full ${isLoanPaid ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${Math.min(loanProgress, 100)}%` }}
                  />
                </View>
              </View>
            )}

            {isLoanPaid && (
              <View className="rounded-lg bg-success/15 p-3">
                <Text className="text-center text-sm font-medium text-success">{t("loanFullyPaid")}</Text>
              </View>
            )}
          </View>
        </View>

        <CreditCardForm card={firstCard} slot={1} onChange={(card) => update(creditCardFields(1, card))} />
        {showSecondCard ? (
          <CreditCardForm card={secondCard} slot={2} onChange={(card) => update(creditCardFields(2, card))} />
        ) : (
          <Button label={t("addSecondCreditCard")} icon={Plus} variant="secondary" onPress={() => { void haptics.light(); setAddingSecondCard(true); }} />
        )}
        {showSecondCard && <Button label={t("save")} icon={Save} busy={saving} onPress={() => { void handleSave(); }} />}
      </View>
    </KeyboardAwareScrollView>

      {datePickerVisible && (
        <DatePicker
          value={loans.loan_start_date}
          onChange={(d) => update({ loan_start_date: d })}
          onClose={() => setDatePickerVisible(false)}
        />
      )}
    </>
  );
}
