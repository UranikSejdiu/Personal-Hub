import { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Landmark, CreditCard, Save, ChevronRight } from "lucide-react-native";
import { useI18n } from "../../src/lib/i18n";
import {
  loadLoans,
  saveLoans,
  type Loans,
  EMPTY_LOANS,
} from "../../src/lib/budget";
import { pmt, remainingBalance, getActualSchedule, type ScheduleRow, creditCardPayoff } from "../../src/lib/calculations";
import { formatCurrency } from "../../src/lib/utils";
import { NumberInput } from "../../src/components/NumberInput";
import { DatePicker } from "../../src/components/DatePicker";
import { useThemeColors } from "../../src/lib/theme";

export default function LoansScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [loans, setLoans] = useState<Loans>(EMPTY_LOANS);
  const [saved, setSaved] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  useEffect(() => {
    loadLoans().then(setLoans);
  }, []);

  const handleSave = useCallback(async () => {
    await saveLoans(loans);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [loans]);

  const update = useCallback((fields: Partial<Loans>) => {
    setLoans((prev) => ({ ...prev, ...fields }));
  }, []);

  const loanPayment =
    loans.loan_amount <= 0 || loans.loan_term <= 0
      ? 0
      : loans.loan_payment > 0
        ? loans.loan_payment
        : pmt(loans.loan_amount, loans.loan_rate, loans.loan_term);

  const schedule = useMemo<ScheduleRow[]>(() => {
    if (
      loans.loan_amount > 0 &&
      loans.loan_term > 0 &&
      loans.loan_start_date &&
      loans.loan_start_date.length > 0
    ) {
      return getActualSchedule(
        loans.loan_amount,
        loans.loan_rate,
        loans.loan_term,
        loans.loan_start_date,
        loans.loan_payment_day,
        loans.loan_payment > 0 ? loans.loan_payment : undefined
      );
    }
    return [];
  }, [
    loans.loan_amount,
    loans.loan_rate,
    loans.loan_term,
    loans.loan_start_date,
    loans.loan_payment_day,
    loans.loan_payment,
  ]);

  const payoff = useMemo(() => {
    if (loans.cc_balance <= 0 || loans.cc_payment <= 0) return null;
    return creditCardPayoff(loans.cc_balance, loans.cc_apr, loans.cc_payment);
  }, [loans.cc_balance, loans.cc_apr, loans.cc_payment]);

  const isLoanPaid = loans.loan_months_paid >= loans.loan_term;
  const loanProgress = isLoanPaid
    ? 100
    : loans.loan_term > 0
      ? Math.round((loans.loan_months_paid / loans.loan_term) * 100)
      : 0;
  const loanBalance =
    loans.loan_amount > 0 && loans.loan_term > 0
      ? remainingBalance(loans.loan_amount, loans.loan_rate, loans.loan_term, loans.loan_months_paid)
      : 0;

  const isCcPaid = loans.cc_months_paid > 0 && loans.cc_balance <= 0;

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
      <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{t("tabLoans")}</Text>
          <Pressable
            onPress={handleSave}
            className="flex-row items-center gap-1 rounded-lg bg-primary px-4 py-2"
          >
            <Save size={16} color={colors.primaryForeground} />
            <Text className="text-sm font-medium text-primary-foreground">{t("save")}</Text>
          </Pressable>
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
              <Text className="mb-1 text-sm text-muted-foreground">{t("loanAmount")}</Text>
               <NumberInput value={loans.loan_amount} onChange={(v) => update({ loan_amount: v })} min={0} decimals={2} placeholder="0.00" />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanRate")}</Text>
                 <NumberInput value={loans.loan_rate} onChange={(v) => update({ loan_rate: v })} min={0} decimals={2} placeholder="0" />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanTerm")}</Text>
                <NumberInput value={loans.loan_term} onChange={(v) => update({ loan_term: v })} min={0} step={1} placeholder="0" />
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanMonthsPaid")}</Text>
                <NumberInput value={loans.loan_months_paid} onChange={(v) => update({ loan_months_paid: v })} min={0} step={1} placeholder="0" />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("loanPaymentDay")}</Text>
                <NumberInput value={loans.loan_payment_day} onChange={(v) => update({ loan_payment_day: v })} min={1} max={31} step={1} placeholder="1" />
              </View>
            </View>

            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("optionalPayment")}</Text>
              <NumberInput value={loans.loan_payment} onChange={(v) => update({ loan_payment: v })} min={0} decimals={2} placeholder="0.00" />
            </View>

            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("loanStartDate")}</Text>
              <Pressable
                onPress={() => setDatePickerVisible(true)}
                className="flex-row items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
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

        {schedule.length > 0 && (
          <View className="rounded-xl border border-border bg-card p-4">
            <Text className="mb-3 text-base font-semibold text-foreground">
              {t("scheduleTitle")}
            </Text>

            <View className="flex-row gap-2">
              <View className="flex-1 rounded-lg bg-muted p-2">
                <Text className="text-xs text-muted-foreground">{t("totalInterest")}</Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(schedule.reduce((s, r) => s + r.interest, 0))}
                </Text>
              </View>
              <View className="flex-1 rounded-lg bg-muted p-2">
                <Text className="text-xs text-muted-foreground">{t("totalCost")}</Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(loans.loan_amount + schedule.reduce((s, r) => s + r.interest, 0))}
                </Text>
              </View>
              <View className="flex-1 rounded-lg bg-muted p-2">
                <Text className="text-xs text-muted-foreground">{t("firstPayment")}</Text>
                <Text className="font-medium text-foreground">
                  {formatCurrency(schedule[0].payment)}
                </Text>
              </View>
            </View>

            <View className="mt-2 overflow-hidden rounded-md border border-border">
              <View className="flex-row bg-muted px-2 py-2">
                <Text className="w-6 text-center text-xs font-semibold text-muted-foreground">#</Text>
                <Text className="w-20 text-left text-xs font-semibold text-muted-foreground">{t("dateCol")}</Text>
                <Text className="flex-1 text-right text-xs font-semibold text-muted-foreground">{t("paymentCol")}</Text>
                <Text className="w-20 text-right text-xs font-semibold text-muted-foreground">{t("principalCol")}</Text>
                <Text className="w-20 text-right text-xs font-semibold text-muted-foreground">{t("interestCol")}</Text>
                <Text className="w-20 text-right text-xs font-semibold text-muted-foreground">{t("balanceCol")}</Text>
              </View>
              <ScrollView style={{ maxHeight: 288 }} showsVerticalScrollIndicator={false}>
                {schedule.map((row) => (
                  <View key={row.index} className="flex-row items-center border-t border-border px-2 py-1.5">
                    <Text className="w-6 text-center text-sm text-foreground">{row.index}</Text>
                    <Text className="w-20 text-left text-sm text-foreground">{row.paymentDate}</Text>
                    <Text className="flex-1 text-right text-sm text-foreground">{formatCurrency(row.payment)}</Text>
                    <Text className="w-20 text-right text-sm text-foreground">{formatCurrency(row.capital)}</Text>
                    <Text className="w-20 text-right text-sm text-foreground">{formatCurrency(row.interest)}</Text>
                    <Text className="w-20 text-right text-sm text-foreground">{formatCurrency(row.balance)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Credit Card Section */}
        <View className="rounded-xl border border-border bg-card p-4">
          <View className="mb-3 flex-row items-center gap-2">
             <CreditCard size={20} color={colors.foreground} />
            <Text className="text-base font-semibold text-foreground">{t("ccSection")}</Text>
          </View>

          <View className="gap-3">
            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("ccBalance")}</Text>
               <NumberInput value={loans.cc_balance} onChange={(v) => update({ cc_balance: v })} min={0} decimals={2} placeholder="0.00" />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("ccApr")}</Text>
                 <NumberInput value={loans.cc_apr} onChange={(v) => update({ cc_apr: v })} min={0} decimals={2} placeholder="0" />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-sm text-muted-foreground">{t("ccPayment")}</Text>
                 <NumberInput value={loans.cc_payment} onChange={(v) => update({ cc_payment: v })} min={0} decimals={2} placeholder="0.00" />
              </View>
            </View>

            <View>
              <Text className="mb-1 text-sm text-muted-foreground">{t("ccMonthsPaid")}</Text>
              <NumberInput value={loans.cc_months_paid} onChange={(v) => update({ cc_months_paid: v })} min={0} step={1} placeholder="0" />
            </View>

            {isCcPaid && (
              <View className="rounded-lg bg-success/15 p-3">
                <Text className="text-center text-sm font-medium text-success">{t("cardFullyPaid")}</Text>
              </View>
            )}

            {payoff && (
              <View className="flex-row gap-2">
                <View className="flex-1 rounded-lg bg-muted p-2">
                  <Text className="text-xs text-muted-foreground">{t("monthsToPayoff")}</Text>
                  <Text className="font-medium text-foreground">
                    {payoff.months === Infinity ? t("never") : String(Math.round(payoff.months))}
                  </Text>
                </View>
                <View className="flex-1 rounded-lg bg-muted p-2">
                  <Text className="text-xs text-muted-foreground">{t("totalInterest")}</Text>
                  <Text className="font-medium text-foreground">
                    {payoff.totalInterest === Infinity
                      ? "—"
                      : formatCurrency(payoff.totalInterest)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>

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
