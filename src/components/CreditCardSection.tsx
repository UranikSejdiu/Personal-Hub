import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { CreditCard, Check } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { creditCardPayoff } from "../lib/calculations";
import { creditCardPaymentForMonth, creditCardScheduledMonths, type CreditCardDetails, type CreditCardSlot, isCreditCardActive } from "../lib/creditCards";
import { formatCurrency, withAlpha } from "../lib/utils";

interface Props {
  card: CreditCardDetails;
  slot: CreditCardSlot;
  month: string;
  paid: boolean;
  onToggle: () => void;
}

export function CreditCardSection({ card, slot, month, paid, onToggle }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();

  const ccMonthsPaid = card.monthsPaid;
  // Payoff simulates month-by-month interest until the balance clears.
  const payoff = useMemo(
    () => creditCardPayoff(card.balance, card.apr, card.payment),
    [card.balance, card.apr, card.payment]
  );

  if (!isCreditCardActive(card, month)) return null;
  const name = card.name || t(slot === 1 ? "sectionCreditCard" : "secondCreditCard");

  const paymentThisMonth = creditCardPaymentForMonth(card, month);
  const totalMonths = card.planMode === "installment" ? card.installments : card.balance > 0
    ? payoff.months === Infinity ? 0 : payoff.months
    : creditCardScheduledMonths(card) ?? 0;
  const isPaid = totalMonths > 0 && ccMonthsPaid >= totalMonths;
  const progressPct =
    totalMonths > 0 ? Math.min(100, Math.round((ccMonthsPaid / totalMonths) * 100)) : 0;
  const remainingMonths = totalMonths > 0 ? Math.max(0, totalMonths - ccMonthsPaid) : 0;

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="mb-3 flex-row items-center gap-2">
         <CreditCard size={20} color={colors.foreground} />
        <Text className="flex-1 text-base font-semibold text-foreground">{name}</Text>
      </View>

      <View className="gap-2">
        {totalMonths > 0 ? <>
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
            {t("monthsCount", { paid: ccMonthsPaid, total: totalMonths })}
          </Text>
          <Text className={`text-sm ${isPaid ? "font-semibold text-success" : "text-muted-foreground"}`}>
            {isPaid ? t("paid") : t("monthsLeft", { count: remainingMonths })}
          </Text>
        </View>
        </> : <Text className="text-sm text-muted-foreground">{t("paymentsRecorded", { count: ccMonthsPaid })}</Text>}

        <Pressable
          onPress={() => { void haptics.light(); onToggle(); }}
          disabled={paymentThisMonth <= 0}
          accessible
          accessibilityRole="checkbox"
          accessibilityState={{ checked: paid, disabled: paymentThisMonth <= 0 }}
          accessibilityLabel={t("creditCardPaymentFor", { name })}
          className="min-h-[44px] rounded-lg bg-muted p-3 active:opacity-70"
          android_ripple={{ color: withAlpha(colors.primary, 0.125) }}
        >
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <View className="flex-row items-center gap-2">
              <View
                className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                  paid
                    ? "border-primary bg-primary/15"
                    : "border-muted-foreground/50 bg-secondary"
                }`}
              >
                {paid && <Check size={14} color={colors.primary} />}
              </View>
              <Text className={`text-sm text-muted-foreground ${paid ? "line-through" : ""}`}>
                {t("monthlyPayment")}
              </Text>
            </View>
            <Text className={`text-sm font-medium ${paid ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {formatCurrency(paymentThisMonth)}
            </Text>
          </View>
        </Pressable>

        {isPaid && (
          <View className="rounded-lg bg-success/15 p-3">
            <Text className="text-center text-sm font-medium text-success">{t("cardFullyPaid")}</Text>
          </View>
        )}

        {card.planMode === null && payoff.months === Infinity && card.balance > 0 && (
          <View className="rounded-lg bg-destructive/15 p-3">
            <Text className="text-sm font-medium text-destructive">
              {t("ccWarning", {
                payment: formatCurrency(card.payment),
                interest: formatCurrency(card.balance * (card.apr / 100 / 12)),
              })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
