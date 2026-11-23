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
  return <View className="rounded-xl border border-border/60 bg-card px-3 py-2">
    <View className="flex-row items-center gap-2">
      <View className="h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-container"><Icon size={18} color={colors.onSecondaryContainer} /></View>
      <View className="min-w-0 flex-1 gap-1"><Text className="text-sm font-semibold text-foreground" numberOfLines={2}>{info.name}</Text><Text className="text-xs text-muted-foreground">{info.kind === "loan" ? "Loan" : "Credit Card"} · {formatCurrency(info.payment)} / month</Text></View>
      {onEdit ? <IconButton icon={Pencil} onPress={onEdit} accessibilityLabel={`Edit ${info.name}`} /> : onDelete ? <IconButton icon={Trash2} onPress={onDelete} accessibilityLabel="Delete" /> : null}
    </View>
    {info.term > 0 ? <>
      <View className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary"><View className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></View>
      <Text className="mt-2 text-xs text-muted-foreground">{`${info.monthsPaid} of ${info.term} paid`}</Text>
    </> : <Text className="mt-2 text-xs text-muted-foreground">{`${info.monthsPaid} payments recorded`}</Text>}
    {(info.startMonth || info.endMonth) && <Text className="mt-1 text-xs text-muted-foreground">First month: {info.startMonth ? monthLabel(info.startMonth) : "…"} · {info.endMonth ? `Last: ${monthLabel(info.endMonth)}` : "No end month"}</Text>}

  </View>;
}
