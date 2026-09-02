import { View, Text, Pressable } from "react-native";
import { Landmark, Check } from "lucide-react-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { pmt, remainingBalance, scheduleBalance } from "../lib/calculations";
import { type Budget, type Loans } from "../lib/budget";
import { formatCurrency } from "../lib/utils";

interface Props {
  budget: Budget;
  loans: Loans;
  onToggle: () => void;
}

export function LoanPaymentSection({ budget, loans, onToggle }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  if (loans.loan_amount <= 0 && loans.loan_term <= 0) return null;

  const loanMonthsPaid = loans.loan_months_paid;
  const isPaid = loanMonthsPaid >= loans.loan_term;
  const hasSchedule =
    loans.loan_start_date !== null &&
    loans.loan_start_date.length > 0 &&
    loans.loan_term > 0 &&
    loans.loan_amount > 0;

  const scheduleInfo = hasSchedule
    ? scheduleBalance(
        loans.loan_amount,
        loans.loan_rate,
        loans.loan_term,
        loans.loan_start_date ?? "",
        loans.loan_payment_day,
        loanMonthsPaid,
        loans.loan_payment > 0 ? loans.loan_payment : undefined
      )
    : null;

  const monthlyPayment = scheduleInfo
    ? scheduleInfo.payment
    : pmt(loans.loan_amount, loans.loan_rate, loans.loan_term);
  const balance = scheduleInfo
    ? scheduleInfo.balance
    : remainingBalance(
        loans.loan_amount,
        loans.loan_rate,
        loans.loan_term,
        loanMonthsPaid
      );
  const progressPct = isPaid
    ? 100
    : loans.loan_term > 0
      ? Math.round((loanMonthsPaid / loans.loan_term) * 100)
      : 0;
  const remainingMonths = Math.max(0, loans.loan_term - loanMonthsPaid);

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="mb-3 flex-row items-center gap-2">
         <Landmark size={20} color={colors.foreground} />
        <Text className="text-base font-semibold text-foreground">{t("sectionLoanPayment")}</Text>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">{t("progress")}</Text>
          <Text className="text-sm font-medium text-foreground">{progressPct}%</Text>
        </View>

        <View className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <View
            className={`h-full rounded-full ${isPaid ? "bg-success" : "bg-primary"}`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </View>

        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">
            {t("monthsCount", { paid: loanMonthsPaid, total: loans.loan_term })}
          </Text>
          <Text className={`text-sm ${isPaid ? "font-semibold text-success" : "text-muted-foreground"}`}>
            {isPaid ? t("paid") : t("monthsLeft", { count: remainingMonths })}
          </Text>
        </View>

        {!isPaid && (
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">{t("remainingBalanceLabel")}</Text>
            <Text className="text-sm font-medium text-foreground">{formatCurrency(balance)}</Text>
          </View>
        )}

             <View className="flex-row items-center gap-3 rounded-lg bg-muted p-3">
               <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => { void haptics.light(); onToggle(); }}
                    className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                      budget.loan_paid
                        ? "border-primary bg-primary/15"
                        : "border-muted-foreground/50 bg-secondary"
                    }`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: budget.loan_paid }}
                    accessibilityLabel={t("monthlyPayment")}
                    android_ripple={{ color: colors.primary + "20" }}
                  >
                   {budget.loan_paid && <Check size={14} color={colors.primary} />}
                 </Pressable>
                 <Text className={`text-sm ${budget.loan_paid ? "line-through text-muted-foreground" : "text-foreground"}`}>
                   {t("monthlyPayment")}
                 </Text>
               </View>
               <Text className={`text-sm font-medium ${budget.loan_paid ? "text-muted-foreground line-through" : "text-foreground"}`}>
                 {formatCurrency(monthlyPayment)}
               </Text>
             </View>

        {isPaid && (
          <View className="rounded-lg bg-success/15 p-3">
            <Text className="text-center text-sm font-medium text-success">{t("loanFullyPaid")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
