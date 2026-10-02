import { Pressable, Text, View } from "react-native";
import { CreditCard, Landmark } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { formatCurrency } from "../lib/utils";
import type { RepaymentKind } from "../lib/repaymentPlans";

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
  const { t } = useI18n();
  const colors = useThemeColors();
  const Icon = info.kind === "loan" ? Landmark : CreditCard;
  const progress = info.term > 0 ? Math.min(100, Math.round((info.monthsPaid / info.term) * 100)) : 0;
  return <View className="rounded-xl border border-border bg-card p-4">
    <View className="flex-row items-center gap-2"><Icon size={19} color={colors.foreground} /><Text className="flex-1 text-base font-semibold text-foreground">{info.name}</Text></View>
    {info.term > 0 ? <>
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"><View className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></View>
      <Text className="mt-2 text-sm text-muted-foreground">{t("loanPaidOfTotal", { paid: info.monthsPaid, total: info.term })} · {t("paymentsRemaining", { count: Math.max(0, info.term - info.monthsPaid) })}</Text>
    </> : <Text className="mt-2 text-sm text-muted-foreground">{t("paymentsRecorded", { count: info.monthsPaid })}</Text>}
    {(info.startMonth || info.endMonth) && <Text className="mt-1 text-xs text-muted-foreground">{info.startMonth ?? "…"} – {info.endMonth ?? t("noEndMonth")}</Text>}
    {info.payment > 0 && <Text className="mt-1 text-base font-medium text-foreground">{formatCurrency(info.payment)} {t("perMonth")}</Text>}
    {(onEdit || onDelete) && <View className="mt-2 flex-row gap-3">
      {onEdit && <Pressable onPress={onEdit} accessible accessibilityRole="button" accessibilityLabel={`${t("edit")}: ${info.name}`} className="min-h-[44px] justify-center px-2 active:opacity-70"><Text className="text-sm font-semibold text-primary">{t("edit")}</Text></Pressable>}
      {onDelete && <Pressable onPress={onDelete} accessible accessibilityRole="button" accessibilityLabel={`${t("delete")}: ${info.name}`} className="min-h-[44px] justify-center px-2 active:opacity-70"><Text className="text-sm font-semibold text-destructive">{t("delete")}</Text></Pressable>}
    </View>}
  </View>;
}
