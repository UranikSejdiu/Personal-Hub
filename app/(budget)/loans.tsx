import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, Pressable, Keyboard } from "react-native";
import { Landmark, CreditCard, Save, ChevronRight } from "lucide-react-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../src/components/ui/table";

export default function LoansScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [loans, setLoans] = useState<Loans>(EMPTY_LOANS);
  const [saved, setSaved] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLoans()
      .then((l) => { if (!cancelled) setLoans(l); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    await saveLoans(loans);
    void haptics.success();
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }, [loans, haptics]);

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
      <ScrollView className="flex-1 bg-background" keyboardDismissMode="on-drag" onTouchStart={() => Keyboard.dismiss()}>
      <View className="w-full max-w-md self-center gap-3 p-4 pb-28">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{t("tabLoans")}</Text>
          <Pressable
            onPress={handleSave}
            className="flex-row items-center gap-1 rounded-lg bg-primary px-4 py-2"
            android_ripple={{ color: colors.primaryForeground + "30" }}
            accessibilityRole="button"
            accessibilityLabel={t("save")}
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
                android_ripple={{ color: colors.primary + "20" }}
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

        {schedule.length > 0 && (
          <View className="rounded-xl border border-border bg-card p-4">
            <Text className="mb-3 text-base font-medium text-foreground">
              {t("scheduleTitle")}
            </Text>

            <View className="flex-row gap-2">
              <View className="flex-1 items-center rounded-md bg-muted p-2">
                <Text className="text-sm text-muted-foreground">{t("totalInterest")}</Text>
                <Text className="text-center font-medium text-foreground">
                  {formatCurrency(schedule.reduce((s, r) => s + r.interest, 0))}
                </Text>
              </View>
              <View className="flex-1 items-center rounded-md bg-muted p-2">
                <Text className="text-sm text-muted-foreground">{t("totalCost")}</Text>
                <Text className="text-center font-medium text-foreground">
                  {formatCurrency(loans.loan_amount + schedule.reduce((s, r) => s + r.interest, 0))}
                </Text>
              </View>
              <View className="flex-1 items-center rounded-md bg-muted p-2">
                <Text className="text-sm text-muted-foreground">{t("firstPayment")}</Text>
                <Text className="text-center font-medium text-foreground">
                  {formatCurrency(schedule[0].payment)}
                </Text>
              </View>
            </View>

            <Table className="mt-3" scrollable>
              <TableHeader>
                <TableHead className="w-5 text-center">#</TableHead>
                <TableHead className="w-[70]">{t("dateCol")}</TableHead>
                <TableHead className="flex-1 text-right">{t("paymentCol")}</TableHead>
                <TableHead className="w-[68] text-right">{t("principalCol")}</TableHead>
                <TableHead className="w-[68] text-right">{t("interestCol")}</TableHead>
                <TableHead className="w-[68] text-right">{t("balanceCol")}</TableHead>
              </TableHeader>
              <TableBody scrollable style={{ maxHeight: 288 }}>
                {schedule.map((row) => (
                  <TableRow key={row.index}>
                    <TableCell className="w-5 text-center">{row.index}</TableCell>
                    <TableCell className="w-[70]">{row.paymentDate}</TableCell>
                    <TableCell className="flex-1 text-right">{formatCurrency(row.payment)}</TableCell>
                    <TableCell className="w-[68] text-right">{formatCurrency(row.capital)}</TableCell>
                    <TableCell className="w-[68] text-right">{formatCurrency(row.interest)}</TableCell>
                    <TableCell className="w-[68] text-right">{formatCurrency(row.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
