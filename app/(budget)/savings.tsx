import { useEffect, useState, useCallback, startTransition, useMemo } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { Plus, Trash2, CircleCheck, ArrowDownLeft, ArrowUpRight, Archive } from "lucide-react-native";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { loadSavingsGoal } from "../../src/lib/budget";
import {
  listAutoDeposits,
  deleteAutoDeposit,
  listTransactions,
  addTransaction,
  deleteTransaction,
  updateTransaction,
  getSavingsSummary,
  closeYear,
  type SavingsTransaction,
  type SavingsSummary,
  type SavingsEntryType,
  type TransactionUpdate,
} from "../../src/lib/savings";
import { formatCurrency } from "../../src/lib/utils";
import { todayDate } from "../../src/lib/dhikr";
import { DatePicker } from "../../src/components/DatePicker";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";

interface SavingsEntry {
  id: string;
  kind: "auto" | "tx";
  type: SavingsEntryType;
  description: string;
  amount: number;
  date: string;
  rawMonth?: string;
  rawTx?: SavingsTransaction;
}

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export default function SavingsScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [goalAmount, setGoalAmount] = useState(0);
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [summary, setSummary] = useState<SavingsSummary>({ balance: 0, totalSaved: 0, totalSpent: 0 });
  const [selectedYear, setSelectedYear] = useState<number | "all">(() => new Date().getFullYear());

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingKind, setEditingKind] = useState<"auto" | "tx">("tx");
  const [formType, setFormType] = useState<SavingsEntryType>("purchase");
  const [formDesc, setFormDesc] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [modalError, setModalError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [saving, setSaving] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const loadData = useCallback(async () => {
    const [sg, ads, txs, sum] = await Promise.all([
      loadSavingsGoal(),
      listAutoDeposits(),
      listTransactions(),
      getSavingsSummary(),
    ]);
    setGoalAmount(sg.goal_amount);
    setSummary(sum);

    const autoEntries: SavingsEntry[] = ads.map((ad) => ({
      id: `auto:${ad.month}`,
      kind: "auto" as const,
      type: "deposit" as const,
      description: ad.month,
      amount: ad.amount,
      date: ad.month,
      rawMonth: ad.month,
    }));
    const txEntries: SavingsEntry[] = txs.map((tx) => ({
      id: `tx:${tx.id}`,
      kind: "tx" as const,
      type: tx.type,
      description: tx.description || t("transaction"),
      amount: tx.amount,
      date: tx.date,
      rawTx: tx,
    }));
    const merged = [...autoEntries, ...txEntries].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(merged);
  }, [t]);

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
  }, [loadData]);

  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const e of entries) {
      const y = Number(e.date.slice(0, 4));
      if (Number.isFinite(y)) set.add(y);
    }
    if (set.size === 0) return [currentYear];
    return Array.from(set).sort((a, b) => b - a);
  }, [entries, currentYear]);

  const filteredEntries = useMemo(() => {
    if (selectedYear === "all") return entries;
    return entries.filter((e) => Number(e.date.slice(0, 4)) === selectedYear);
  }, [entries, selectedYear]);

  const handleDeleteEntry = useCallback(
    (entry: SavingsEntry) => {
      setConfirmAction({
        title: t("deleteConfirmTitle"),
        message: t("deleteSavingsEntryConfirm"),
        confirmLabel: t("delete"),
        destructive: true,
        onConfirm: () => {
          void (async () => {
            try {
              if (entry.kind === "auto" && entry.rawMonth) {
                await deleteAutoDeposit(entry.rawMonth);
              } else if (entry.kind === "tx" && entry.rawTx) {
                await deleteTransaction(entry.rawTx.id);
              }
              await loadData();
              setConfirmAction(null);
            } catch {
              toast.error(t("errorDeletingSavings"));
              setConfirmAction(null);
            }
          })();
        },
      });
    },
    [t, loadData]
  );

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setEditingKind("tx");
    setFormType("purchase");
    setFormDesc("");
    setFormAmount("");
    setFormDate(todayDate());
    setModalError("");
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((item: SavingsTransaction) => {
    setEditingId(item.id);
    setEditingKind("tx");
    setFormType(item.type);
    setFormDesc(item.description);
    setFormAmount(String(item.amount));
    setFormDate(item.date);
    setModalError("");
    setShowModal(true);
  }, []);

  const handleTapEntry = useCallback(
    (entry: SavingsEntry) => {
      if (entry.kind === "tx" && entry.rawTx) {
        openEditModal(entry.rawTx);
      }
    },
    [openEditModal]
  );

  const handleCloseYear = useCallback(
    (year: number) => {
      const yearEntries = entries.filter((e) => Number(e.date.slice(0, 4)) === year);
      let net = 0;
      for (const e of yearEntries) {
        if (e.type === "deposit") net += e.amount;
        else net -= e.amount;
      }
      if (net === 0) {
        toast(t("savingsNoEntries"));
        return;
      }
      const nextYear = year + 1;
      const desc = t("closingBalance", { year }) as string;
      setConfirmAction({
        title: t("closeYearLabel"),
        message: t("closeYearConfirm", {
          year,
          amount: formatCurrency(Math.abs(net)),
          nextYear,
        }) as string,
        confirmLabel: t("closeYearLabel"),
        onConfirm: () => {
          void (async () => {
            try {
              await closeYear(year, desc);
              await loadData();
              setSelectedYear(nextYear);
              setConfirmAction(null);
              void haptics.success();
              toast.success(t("savedSuccess"));
            } catch {
              toast.error(t("errorAddingSavings"));
              setConfirmAction(null);
            }
          })();
        },
      });
    },
    [entries, t, loadData, haptics]
  );

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(formAmount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setModalError(t("savingsErrorAmount"));
      return;
    }
    if (!formDate) {
      setModalError(t("savingsErrorDate"));
      return;
    }
    setSaving(true);
    try {
      if (editingId === null) {
        await addTransaction(formType, formDesc, parsed, formDate);
      } else {
        const update: TransactionUpdate = {
          type: formType,
          description: formDesc,
          amount: parsed,
          date: formDate,
        };
        await updateTransaction(editingId, update);
      }
      setShowModal(false);
      await loadData();
      void haptics.success();
    } catch {
      toast.error(editingId === null ? t("errorAddingSavings") : t("errorUpdatingSavings"));
    } finally {
      setSaving(false);
    }
  }, [formType, formDesc, formAmount, formDate, editingId, t, loadData, haptics]);

  const requestDelete = useCallback(() => {
    if (editingId === null) return;
    setConfirmAction({
      title: t("deleteConfirmTitle"),
      message: t("deleteSavingsEntryConfirm"),
      confirmLabel: t("delete"),
      destructive: true,
      onConfirm: () => {
        void (async () => {
          try {
            await deleteTransaction(editingId);
            setShowModal(false);
            await loadData();
            setConfirmAction(null);
          } catch {
            toast.error(t("errorDeletingSavings"));
            setConfirmAction(null);
          }
        })();
      },
    });
  }, [editingId, t, loadData]);

  const goalMet = goalAmount > 0 && summary.balance >= goalAmount;
  const goalProgress = goalAmount > 0 ? Math.min(100, (summary.balance / goalAmount) * 100) : 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
          <Text className="text-xl font-bold text-foreground">{t("tabSavings")}</Text>

          {goalAmount > 0 && (
            <View className="rounded-xl border border-border bg-card p-4">
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-base font-semibold text-foreground">{t("savingsGoalLabel")}</Text>
                {goalMet && (
                  <View className="flex-row items-center gap-1 rounded-full bg-success/15 px-2 py-0.5">
                    <CircleCheck size={12} color={colors.success} />
                    <Text className="text-[11px] font-semibold text-success">{t("goalMetBadge")}</Text>
                  </View>
                )}
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">{t("goalColon")}</Text>
                <Text className="text-sm font-medium text-foreground">{formatCurrency(goalAmount)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted-foreground">{t("savedLabel")}</Text>
                <Text className={`text-sm font-medium ${goalMet ? "text-success" : "text-foreground"}`}>
                  {formatCurrency(summary.balance)}
                </Text>
              </View>
              <View className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-border">
                <View className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`} style={{ width: `${goalProgress}%` }} />
              </View>
            </View>
          )}

          <View className="flex-grow rounded-xl border border-border bg-card p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">{t("activityLabel")}</Text>
              <Pressable
                onPress={() => { void haptics.light(); openCreateModal(); }}
                className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5"
                android_ripple={{ color: colors.primaryForeground + "30" }}
                accessibilityRole="button"
                accessibilityLabel={t("savingsNewEntry")}
              >
                <Plus size={14} color={colors.primaryForeground} />
                <Text className="text-xs font-medium text-primary-foreground">{t("savingsNewEntry")}</Text>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {availableYears.map((y) => {
                const isSelected = selectedYear === y;
                const isPastYear = y < currentYear;
                return (
                  <View key={y} className="flex-row items-center gap-1">
                    <Pressable
                      onPress={() => { void haptics.light(); setSelectedYear(y); }}
                      className={`rounded-full border px-3 py-1.5 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-muted/40"}`}
                      android_ripple={{ color: colors.primary + "20" }}
                      accessibilityRole="button"
                      accessibilityLabel={String(y)}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text className={`text-xs font-medium ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{y}</Text>
                    </Pressable>
                    {isPastYear && (
                      <Pressable
                        onPress={() => handleCloseYear(y)}
                        className="rounded-full border border-border bg-card p-1.5"
                        accessibilityLabel={t("closeYearLabel")}
                      >
                        <Archive size={14} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
              <Pressable
                onPress={() => { void haptics.light(); setSelectedYear("all"); }}
                className={`rounded-full border px-3 py-1.5 ${selectedYear === "all" ? "border-primary bg-primary/10" : "border-border bg-muted/40"}`}
                android_ripple={{ color: colors.primary + "20" }}
                accessibilityRole="button"
                accessibilityLabel={t("filterAll")}
                accessibilityState={{ selected: selectedYear === "all" }}
              >
                <Text className={`text-xs font-medium ${selectedYear === "all" ? "text-primary" : "text-muted-foreground"}`}>{t("filterAll")}</Text>
              </Pressable>
            </ScrollView>

            {filteredEntries.length === 0 ? (
              <View className="py-6 items-center gap-1">
                <Text className="text-sm text-muted-foreground">{t("savingsNoEntries")}</Text>
                <Text className="text-xs text-muted-foreground">{t("savingsNoEntriesHint")}</Text>
              </View>
            ) : (
              <View className="mt-3 gap-2">
                {filteredEntries.map((entry) => {
                  const isAuto = entry.kind === "auto";
                  const isDeposit = entry.type === "deposit";
                  const badgeBg = isAuto ? "bg-primary/15" : isDeposit ? "bg-success/15" : "bg-destructive/15";
                  const badgeText = isAuto ? "text-primary" : isDeposit ? "text-success" : "text-destructive";
                  const badgeLabel = isAuto ? t("savingsAutoBadge") : isDeposit ? t("savingsTypeDeposit") : t("savingsTypePurchase");
                  const amountColor = isDeposit ? "text-success" : "text-destructive";
                  const sign = isDeposit ? "+" : "-";

                  const rowContent = (
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <View className={`rounded-full px-2 py-0.5 ${badgeBg}`}>
                          <Text className={`text-[10px] font-semibold ${badgeText}`}>{badgeLabel}</Text>
                        </View>
                        <Text className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
                          {entry.description}
                        </Text>
                      </View>
                      <Text className="mt-1 text-xs text-muted-foreground">{entry.date}</Text>
                    </View>
                  );

                  return (
                    <View key={entry.id} className="flex-row items-center justify-between rounded-lg bg-muted/40 p-3">
                      {isAuto ? (
                        rowContent
                      ) : (
                        <Pressable onPress={() => handleTapEntry(entry)} className="flex-1 flex-row items-center">
                          {rowContent}
                        </Pressable>
                      )}
                      <Text className={`text-sm font-medium ${amountColor}`}>
                        {sign}
                        {formatCurrency(entry.amount)}
                      </Text>
                      <Pressable
                        onPress={() => {
                          void haptics.warning();
                          handleDeleteEntry(entry);
                        }}
                        className="ml-2 p-1"
                      >
                        <Trash2 size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View className="rounded-xl border border-border bg-muted/40 p-4 gap-1.5">
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">{t("totalSaved")}</Text>
              <Text className="text-sm font-semibold text-foreground">{formatCurrency(summary.totalSaved)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted-foreground">{t("totalSpent")}</Text>
              <Text className="text-sm font-medium text-foreground">{formatCurrency(summary.totalSpent)}</Text>
            </View>
            <View className="h-px bg-border my-1" />
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold text-foreground">{t("savingsBalanceLabel")}</Text>
              <Text className="text-sm font-semibold text-success">{formatCurrency(summary.balance)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/50 px-4" onPress={() => setShowModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card p-5">
            <Text className="text-lg font-semibold text-foreground">
              {editingId === null ? t("savingsNewEntry") : t("savingsEditEntry")}
            </Text>
            {modalError ? <Text className="mt-2 text-sm text-destructive">{modalError}</Text> : null}
            <View className="mt-4 gap-4">
              {!(editingId !== null && editingKind === "auto") && (
                <View>
                  <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">{t("savingsEntryType")}</Text>
                  <View className="mt-1 flex-row gap-2">
                    {(["deposit", "purchase"] as const).map((typeOption) => {
                      const Icon = typeOption === "deposit" ? ArrowDownLeft : ArrowUpRight;
                      const active = formType === typeOption;
                      return (
                        <Pressable
                          key={typeOption}
                          onPress={() => setFormType(typeOption)}
                          className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border px-3 py-2.5 ${active ? "border-primary bg-muted" : "border-border"}`}
                        >
                          <Icon size={16} color={typeOption === "deposit" ? colors.success : colors.destructive} />
                          <Text className={typeOption === "deposit" ? "text-success" : "text-destructive"}>
                            {typeOption === "deposit" ? t("savingsTypeDeposit") : t("savingsTypePurchase")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              <View>
                <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">{t("savingsAmountLabel")}</Text>
                <TextInput
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              {!(editingId !== null && editingKind === "auto") && (
                <View>
                  <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">{t("savingsDescriptionLabel")}</Text>
                  <TextInput
                    value={formDesc}
                    onChangeText={setFormDesc}
                    placeholder={t("savingsDescriptionLabel")}
                    className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              )}
              {!(editingId !== null && editingKind === "auto") && (
                <View>
                  <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">{t("savingsDateLabel")}</Text>
                  <Pressable onPress={() => setDatePickerVisible(true)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2.5">
                    <Text className="text-sm text-foreground">{formDate || t("savingsDateLabel")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View className="mt-5 flex-row items-center justify-end gap-2">
              {editingId !== null && (
                <Pressable onPress={() => { void haptics.warning(); requestDelete(); }} className="px-2 py-1">
                  <Text className="text-sm font-medium text-destructive">{t("delete")}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setShowModal(false)} className="px-2 py-1">
                <Text className="text-sm font-medium text-muted-foreground">{t("cancel")}</Text>
              </Pressable>
              <Pressable onPress={() => void handleSave()} disabled={saving} className="rounded-lg bg-primary px-4 py-2" android_ripple={{ color: colors.primaryForeground + "30" }} accessibilityRole="button" accessibilityLabel={t("save")}>
                <Text className="text-sm font-medium text-primary-foreground">{t("save")}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {datePickerVisible && (
        <DatePicker
          value={formDate || null}
          onChange={(d) => {
            setFormDate(d ?? "");
            setDatePickerVisible(false);
          }}
          onClose={() => setDatePickerVisible(false)}
        />
      )}

      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction?.title ?? t("deleteConfirmTitle")}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.confirmLabel ?? t("confirm")}
        cancelLabel={t("cancel")}
        destructive={confirmAction?.destructive ?? true}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm()}
      />
    </View>
  );
}
