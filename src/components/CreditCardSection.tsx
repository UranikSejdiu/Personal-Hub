import { View, Text, Pressable } from "react-native";
import { CreditCard, Check } from "lucide-react-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { creditCardPayoff } from "../lib/calculations";
import { formatCurrency, type Budget, type Loans } from "../lib/budget";

interface Props {
  budget: Budget;
  loans: Loans;
  onToggle: () => void;
}

export function CreditCardSection({ budget, loans, onToggle }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  if (loans.cc_balance <= 0 && loans.cc_payment <= 0) return null;

  const ccMonthsPaid = loans.cc_months_paid;
  const payoff = creditCardPayoff(loans.cc_balance, loans.cc_apr, loans.cc_payment);
  const totalMonths = payoff.months === Infinity ? 0 : payoff.months;
  const isPaid = totalMonths > 0 && ccMonthsPaid >= totalMonths;
  const progressPct =
    totalMonths > 0 ? Math.min(100, Math.round((ccMonthsPaid / totalMonths) * 100)) : 0;
  const remainingMonths = totalMonths > 0 ? Math.max(0, totalMonths - ccMonthsPaid) : 0;

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="mb-3 flex-row items-center gap-2">
         <CreditCard size={20} color={colors.foreground} />
        <Text className="text-base font-semibold text-foreground">{t("sectionCreditCard")}</Text>
      </View>

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">{t("progress")}</Text>
          <Text className="text-sm font-medium text-foreground">{isPaid ? 100 : progressPct}%</Text>
        </View>

        <View className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <View
            className={`h-full rounded-full ${isPaid ? "bg-success" : "bg-primary"}`}
            style={{ width: `${isPaid ? 100 : Math.min(progressPct, 100)}%` }}
          />
        </View>

        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">
            {t("monthsCount", { paid: ccMonthsPaid, total: totalMonths || "?" })}
          </Text>
          <Text className={`text-sm ${isPaid ? "font-semibold text-success" : "text-muted-foreground"}`}>
            {isPaid ? t("paid") : totalMonths > 0 ? t("monthsLeft", { count: remainingMonths }) : ""}
          </Text>
        </View>

        <View className="rounded-lg bg-muted p-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={onToggle}
                className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                  budget.cc_paid
                    ? "border-primary bg-primary/15"
                    : "border-muted-foreground/50 bg-secondary"
                }`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: budget.cc_paid }}
                accessibilityLabel={t("monthlyPayment")}
              >
                {budget.cc_paid && <Check size={14} color={colors.primary} />}
              </Pressable>
              <Text className={`text-sm text-muted-foreground ${budget.cc_paid ? "line-through" : ""}`}>
                {t("monthlyPayment")}
              </Text>
            </View>
            <Text className={`text-sm font-medium ${budget.cc_paid ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {formatCurrency(loans.cc_payment)}
            </Text>
          </View>
        </View>

        {isPaid && (
          <View className="rounded-lg bg-success/15 p-3">
            <Text className="text-center text-sm font-medium text-success">{t("cardFullyPaid")}</Text>
          </View>
        )}

        {payoff.months === Infinity && loans.cc_balance > 0 && (
          <View className="rounded-lg bg-destructive/15 p-3">
            <Text className="text-sm font-medium text-destructive">
              {t("ccWarning", {
                payment: formatCurrency(loans.cc_payment),
                interest: formatCurrency(loans.cc_balance * (loans.cc_apr / 100 / 12)),
              })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
