import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { CreditCard, ChevronRight } from "./AppIcons";
import { NumberInput } from "./NumberInput";
import { DatePicker } from "./DatePicker";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { creditCardPayoff, MAX_LOAN_AMOUNT, MAX_LOAN_TERM_MONTHS } from "../lib/calculations";
import { creditCardScheduledMonths, isCreditCardScheduleValid, type CreditCardDetails, type CreditCardSlot } from "../lib/creditCards";
import { formatCurrency } from "../lib/utils";

interface Props {
  card: CreditCardDetails;
  slot: CreditCardSlot;
  onChange: (card: CreditCardDetails) => void;
}

export function CreditCardForm({ card, slot, onChange }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [editingMonth, setEditingMonth] = useState<"startMonth" | "endMonth" | null>(null);
  const update = (fields: Partial<CreditCardDetails>) => onChange({ ...card, ...fields });
  const payoff = useMemo(() => card.balance > 0 && card.payment > 0 ? creditCardPayoff(card.balance, card.apr, card.payment) : null, [card.balance, card.apr, card.payment]);
  const isPaid = card.monthsPaid > 0 && card.balance <= 0;
  const scheduleValid = isCreditCardScheduleValid(card);
  const scheduledMonths = creditCardScheduledMonths(card);

  return (
    <View className="rounded-xl border border-border bg-card p-4">
      <View className="mb-3 flex-row items-center gap-2">
        <CreditCard size={20} color={colors.foreground} />
        <Text accessibilityRole="header" className="flex-1 text-base font-semibold text-foreground">{t(slot === 1 ? "ccSection" : "secondCreditCard")}</Text>
      </View>
      <View className="gap-3">
        <View>
          <Text className="mb-1 text-sm text-muted-foreground">{t("ccName")}</Text>
          <TextInput className="min-h-[44px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" value={card.name} onChangeText={(name) => update({ name })} placeholder={t("ccNamePlaceholder")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("ccName")} />
        </View>
        <View>
          <Text className="mb-1 text-sm text-muted-foreground">{t("ccBalance")}</Text>
          <NumberInput value={card.balance} onChange={(balance) => update({ balance })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className="mb-1 text-sm text-muted-foreground">{t("ccApr")}</Text>
            <NumberInput value={card.apr} onChange={(apr) => update({ apr })} min={0} decimals={2} placeholder="0" />
          </View>
          <View className="flex-1">
            <Text className="mb-1 text-sm text-muted-foreground">{t("ccPayment")}</Text>
            <NumberInput value={card.payment} onChange={(payment) => update({ payment })} min={0} max={MAX_LOAN_AMOUNT} decimals={2} placeholder="0.00" />
          </View>
        </View>
        <View>
          <Text className="mb-1 text-sm text-muted-foreground">{t("ccMonthsPaid")}</Text>
          <NumberInput value={card.monthsPaid} onChange={(monthsPaid) => update({ monthsPaid })} min={0} max={MAX_LOAN_TERM_MONTHS} placeholder="0" />
        </View>
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
        {isPaid && <View className="rounded-lg bg-success/15 p-3"><Text className="text-center text-sm font-medium text-success">{t("cardFullyPaid")}</Text></View>}
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
      </View>
      {editingMonth && <DatePicker mode="month" value={card[editingMonth]} onChange={(value) => update({ [editingMonth]: value })} onClose={() => setEditingMonth(null)} />}
    </View>
  );
}
