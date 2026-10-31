import { Text } from "./ui/Typography";
import { View } from "react-native";
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
  last?: boolean;
}

export function RepaymentPaymentSection({ plan, month, paid, onToggle, last = false }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const payment = repaymentForMonth(plan, month);
  if (payment <= 0) return null;
  const name = plan.name || t(plan.kind === "loan" ? "loanSection" : "ccSection");
  return <View className={`min-h-[64px] flex-row items-center gap-3 py-2.5 ${last ? "" : "border-b border-border/60"}`}>
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-sm font-semibold text-foreground">{name}</Text>
      <Text className="text-xs text-muted-foreground">{formatCurrency(payment)} · {t(plan.kind === "loan" ? "loanSection" : "ccSection")}</Text>
    </View>
    <Checkbox checked={paid} onPress={onToggle} accessibilityLabel={t("creditCardPaymentFor", { name })} android_ripple={{ color: withAlpha(colors.primary, 0.125) }} />
  </View>;
}
