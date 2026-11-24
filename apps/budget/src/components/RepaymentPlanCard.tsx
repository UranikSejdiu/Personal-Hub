import { Text } from "./ui/Typography";
import { View } from "react-native";
import { CreditCard, Landmark, Pencil, Trash2 } from "./AppIcons";
import { monthLabel } from "../lib/monthLabel";
import { useThemeColors } from "../lib/theme";
import { formatCurrency } from "../lib/utils";
import type { RepaymentKind } from "../lib/repaymentPlans";
import { IconButton } from "./ui/Button";

export interface RepaymentPlanCardInfo {
  kind: RepaymentKind;
  name: string;
  payment: number;
  monthsPaid: number;
  term: number;
  startMonth: string | null;
  endMonth: string | null;
}

interface Props {
  info: RepaymentPlanCardInfo;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function RepaymentPlanCard({ info, onEdit, onDelete }: Props) {
  const colors = useThemeColors();
  const Icon = info.kind === "loan" ? Landmark : CreditCard;
  const progress = info.term > 0 ? Math.min(100, Math.round((info.monthsPaid / info.term) * 100)) : 0;
  return <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
    <View className="flex-row items-center gap-3">
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Icon size={18} color={colors.foreground} /></View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-semibold text-foreground" numberOfLines={2}>{info.name}</Text>
        <Text className="text-label-medium text-muted-foreground">{info.kind === "loan" ? "Loan" : "Credit card"}</Text>
      </View>
      {onEdit ? <IconButton icon={Pencil} onPress={onEdit} accessibilityLabel={`Edit ${info.name}`} /> : onDelete ? <IconButton icon={Trash2} onPress={onDelete} accessibilityLabel="Delete" /> : null}
    </View>
    <View className="flex-row flex-wrap items-baseline gap-x-2 border-t border-border pt-3">
      <Text className="shrink text-xl font-semibold text-foreground" style={{ fontVariant: ["tabular-nums"] }}>{formatCurrency(info.payment)}</Text>
      <Text className="text-label-medium text-muted-foreground">/ month</Text>
    </View>
    <View className="gap-1.5">
      <Text className="text-label-medium text-muted-foreground">{info.term > 0 ? `${info.monthsPaid} of ${info.term} paid` : `${info.monthsPaid} payments recorded`}</Text>
      {info.term > 0 && <View accessible accessibilityRole="progressbar" accessibilityLabel="Payments made"
        accessibilityValue={{ min: 0, max: info.term, now: Math.min(info.monthsPaid, info.term) }}
        className="h-1.5 overflow-hidden rounded-full bg-secondary-container">
        <View className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </View>}
      {(info.startMonth || info.endMonth) && <Text className="text-label-medium text-muted-foreground">First month: {info.startMonth ? monthLabel(info.startMonth) : "…"} · {info.endMonth ? `Last: ${monthLabel(info.endMonth)}` : "No end month"}</Text>}
    </View>
  </View>;
}
