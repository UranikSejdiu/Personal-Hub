import { Text } from "./ui/Typography";
import { View } from "react-native";
import { CreditCard, Landmark, MoreHorizontal, Pencil, Trash2 } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useHaptics } from "../hooks/useHaptics";
import { formatCurrency } from "../lib/utils";
import type { RepaymentKind } from "../lib/repaymentPlans";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";
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
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const Icon = info.kind === "loan" ? Landmark : CreditCard;
  const progress = info.term > 0 ? Math.min(100, Math.round((info.monthsPaid / info.term) * 100)) : 0;
  return <View className="rounded-[14px] border border-border/60 bg-card p-3">
    <View className="flex-row items-center gap-2">
      <View className="h-[39px] w-[39px] items-center justify-center rounded-[11px] bg-secondary"><Icon size={19} color={colors.primary} /></View>
      <View className="min-w-0 flex-1 gap-1"><Text className="text-sm font-semibold text-foreground" numberOfLines={2}>{info.name}</Text><Text className="text-xs text-muted-foreground">{t(info.kind === "loan" ? "loanSection" : "ccSection")} · {formatCurrency(info.payment)} {t("perMonth")}</Text></View>
      {(onEdit || onDelete) && (
        <View ref={triggerRef} collapsable={false}>
          <IconButton icon={MoreHorizontal} selected={anchor !== null}
            onPress={() => { void haptics.light(); open(); }}
            accessibilityLabel={t("paymentPlanOptions", { name: info.name })}
            accessibilityState={{ expanded: anchor !== null }} />
        </View>
      )}
    </View>
    {info.term > 0 ? <>
      <View className="mt-3 h-[7px] overflow-hidden rounded-full bg-secondary"><View className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></View>
      <Text className="mt-2 text-xs text-muted-foreground">{t("loanPaidOfTotal", { paid: info.monthsPaid, total: info.term })} · {t("paymentsRemaining", { count: Math.max(0, info.term - info.monthsPaid) })}</Text>
    </> : <Text className="mt-2 text-xs text-muted-foreground">{t("paymentsRecorded", { count: info.monthsPaid })}</Text>}
    {(info.startMonth || info.endMonth) && <Text className="mt-1 text-xs text-muted-foreground">{info.startMonth ?? "…"} – {info.endMonth ?? t("noEndMonth")}</Text>}
    {(onEdit || onDelete) && <AnchoredMenu anchor={anchor} onClose={close} items={[
      ...(onEdit ? [{ key: "edit", label: t("edit"), icon: Pencil, onPress: onEdit }] : []),
      ...(onDelete ? [{ key: "delete", label: t("delete"), icon: Trash2, destructive: true,
        onPress: () => { void haptics.warning(); onDelete(); } }] : []),
    ]} />}
  </View>;
}
