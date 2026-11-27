import { Text } from "./ui/Typography";
import { View } from "react-native";
import { Checkbox } from "./ui/Checkbox";
import { useThemeColors } from "../lib/theme";
import { formatCurrency, withAlpha } from "../lib/utils";
import type { RepaymentPlan } from "../lib/repaymentPlans";

interface Props {
  plan: RepaymentPlan;
  payment: number;
  paid: boolean;
  onToggle: () => void;
  last?: boolean;
}

export function RepaymentPaymentSection({ plan, payment, paid, onToggle, last = false }: Props) {
  const colors = useThemeColors();
  const name = plan.name || (plan.kind === "loan" ? "Loan" : "Credit Card");
  return <View className={`min-h-[56px] flex-row items-center gap-1 py-1 ${last ? "" : "border-b border-border/60"}`}>
    <Checkbox className="shrink-0" checked={paid} onPress={onToggle} accessibilityLabel={`${name} monthly payment`} android_ripple={{ color: withAlpha(colors.primary, 0.125) }} />
    <View className="min-w-0 flex-1 gap-1">
      <Text className={`text-sm ${paid ? "text-muted-foreground" : "font-semibold text-foreground"}`}>{name}</Text>
      <Text className="text-xs text-muted-foreground">
        <Text className={paid ? "text-muted-foreground" : "font-medium text-foreground"}>{formatCurrency(payment)}</Text>
        {` · ${plan.kind === "loan" ? "Loan" : "Credit Card"}`}
      </Text>
    </View>
  </View>;
}
