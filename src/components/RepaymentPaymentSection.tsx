import { Text, View } from "react-native";
import { CreditCard, Landmark } from "./AppIcons";
import { Checkbox } from "./ui/Checkbox";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { formatCurrency, withAlpha } from "../lib/utils";
import { repaymentForMonth, type RepaymentPlan } from "../lib/repaymentPlans";

interface Props {
  plan: RepaymentPlan;
  month: string;
  paid: boolean;
  onToggle: () => void;
}

export function RepaymentPaymentSection({ plan, month, paid, onToggle }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const payment = repaymentForMonth(plan, month);
  if (payment <= 0) return null;
  const name = plan.name || t(plan.kind === "loan" ? "loanSection" : "ccSection");
  const Icon = plan.kind === "loan" ? Landmark : CreditCard;
  const progress = plan.term > 0 ? Math.min(100, Math.round((plan.monthsPaid / plan.term) * 100)) : 0;
  return <View className="rounded-xl border border-border bg-card p-4">
    <View className="mb-2 flex-row items-center gap-2">
      <Icon size={20} color={colors.foreground} />
      <Text className="flex-1 text-base font-semibold text-foreground">{name}</Text>
    </View>
    <View className="mb-3 gap-2">
      {plan.term > 0 ? <>
        <View className="h-2 overflow-hidden rounded-full bg-secondary"><View className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></View>
        <View className="flex-row justify-between gap-2">
          <Text className="text-sm text-muted-foreground">{t("loanPaidOfTotal", { paid: plan.monthsPaid, total: plan.term })}</Text>
          <Text className="text-sm text-muted-foreground">{t("paymentsRemaining", { count: Math.max(0, plan.term - plan.monthsPaid) })}</Text>
        </View>
      </> : <Text className="text-sm text-muted-foreground">{t("paymentsRecorded", { count: plan.monthsPaid })}</Text>}
    </View>
    <Checkbox checked={paid} onPress={onToggle} accessibilityLabel={t("creditCardPaymentFor", { name })} className="min-h-[44px] flex-row items-center justify-between rounded-lg bg-muted p-3 active:opacity-70" android_ripple={{ color: withAlpha(colors.primary, 0.125) }}>
      <View className="min-w-0 flex-1 flex-row items-center justify-between gap-2">
        <Text className={paid ? "text-sm text-muted-foreground line-through" : "text-sm text-foreground"}>{t("monthlyPayment")}</Text>
        <Text className={paid ? "text-sm text-muted-foreground line-through" : "text-sm font-medium text-foreground"}>{formatCurrency(payment)}</Text>
      </View>
    </Checkbox>
  </View>;
}
