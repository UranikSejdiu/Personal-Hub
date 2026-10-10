import { Text, TextInput } from "../../src/components/ui/Typography";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { View, Pressable, StyleSheet, FlatList, ActivityIndicator, type ListRenderItemInfo } from "react-native";
import { Plus, Pencil, ArrowDownLeft, ArrowUpRight, Archive, ChevronDown, Lock } from "../../src/components/AppIcons";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { loadSavingsGoal, loadBudget, currentMonth } from "../../src/lib/budget";
import {
  listAutoDeposits,
  deleteAutoDeposit,
  listTransactions,
  addTransaction,
  deleteTransaction,
  updateTransaction,
  updateAutoDeposit,
  getSavingsSummary,
  closeYear,
  previewClosingBalance,
  isClosingMarkerDescription,
  type SavingsTransaction,
  type SavingsSummary,
  type SavingsEntryType,
  type TransactionUpdate,
} from "../../src/lib/savings";
import { formatCurrency } from "../../src/lib/utils";
import { DatePicker } from "../../src/components/DatePicker";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { useThemeColors } from "../../src/lib/theme";
import { useHaptics } from "../../src/hooks/useHaptics";
import { SavingsGoalCard } from "../../src/components/SavingsGoalCard";
import { FormDialog } from "../../src/components/ui/FormDialog";
import { AnchoredMenu, useAnchoredMenu } from "../../src/components/ui/AnchoredMenu";
import { Button, IconButton } from "../../src/components/ui/Button";
import { parseNumberInput } from "../../src/lib/numberInput";

function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

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
  onConfirm: () => void | Promise<void>;
}

export default function SavingsScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [goalAmount, setGoalAmount] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const loadSequence = useRef(0);
  const focused = useRef(false);
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [summary, setSummary] = useState<SavingsSummary>({ balance: 0, totalSaved: 0, totalSpent: 0 });
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");

  const [closeYearOpen, setCloseYearOpen] = useState(false);
  const [closingYear, setClosingYear] = useState<number | null>(null);
  const { triggerRef: yearMenuRef, anchor: yearMenuAnchor, open: openYearMenu, close: closeYearMenu } = useAnchoredMenu();
  const { triggerRef: closingMenuRef, anchor: closingMenuAnchor, open: openClosingMenu, close: closeClosingMenu } = useAnchoredMenu();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<"auto" | "tx">("tx");
  const [formType, setFormType] = useState<SavingsEntryType>("purchase");
  const [formDesc, setFormDesc] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [modalError, setModalError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const loadData = useCallback(async () => {
    const request = ++loadSequence.current;
    if (!focused.current) return;
    setLoadState("loading");
    try {
      const [sg, ads, txs, sum, monthlyBudget] = await Promise.all([
        loadSavingsGoal(),
        listAutoDeposits(),
        listTransactions(),
        getSavingsSummary(),
        loadBudget(currentMonth()),
      ]);
      if (!focused.current || request !== loadSequence.current) return;
      setGoalAmount(monthlyBudget?.savings_goal ?? sg.goal_amount);
      setSummary(sum);

      const autoEntries: SavingsEntry[] = ads.map((ad) => ({
        id: `auto:${ad.month}`,
        kind: "auto" as const,
        type: "deposit" as const,
        description: ad.description || ad.month,
        amount: ad.amount,
        date: ad.month,
        rawMonth: ad.month,
      }));
      const txEntries: SavingsEntry[] = txs.map((tx) => ({
        id: `tx:${tx.id}`,
        kind: "tx" as const,
        type: tx.type,
        description: tx.description || tRef.current("transaction"),
        amount: tx.amount,
        date: tx.date,
        rawTx: tx,
      }));
      const merged = [...autoEntries, ...txEntries].sort((a, b) => b.date.localeCompare(a.date));
      setEntries(merged);
      setLoadState("ready");
    } catch {
      if (focused.current && request === loadSequence.current) {
        setLoadState("failed");
        toast.error(tRef.current("errorLoadingData"));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void loadData();
      return () => { focused.current = false; ++loadSequence.current; };
    }, [loadData])
  );

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

  const openCreateModal = useCallback(() => {
    setEditingId(null);
    setEditingMonth(null);
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
    setEditingMonth(null);
    setEditingKind("tx");
    setFormType(item.type);
    setFormDesc(item.description);
    setFormAmount(String(item.amount));
    setFormDate(item.date);
    setModalError("");
    setShowModal(true);
  }, []);

  const openEditAutoModal = useCallback(
    (month: string, description: string, amount: number) => {
      setEditingId(0);
      setEditingMonth(month);
      setEditingKind("auto");
      setFormType("deposit");
      setFormDesc(description === month ? "" : description);
      setFormAmount(String(amount));
      setFormDate(month);
      setModalError("");
      setShowModal(true);
    },
    []
  );

  const handleTapEntry = useCallback(
    (entry: SavingsEntry) => {
      if (entry.kind === "auto" && entry.rawMonth) {
        openEditAutoModal(entry.rawMonth, entry.description, entry.amount);
      } else if (entry.kind === "tx" && entry.rawTx) {
        if (isClosingMarkerDescription(entry.rawTx.description)) return;
        openEditModal(entry.rawTx);
      }
    },
    [openEditModal, openEditAutoModal]
  );

  const handleCloseYear = useCallback(
    (year: number) => {
      const yearEntries = entries.filter((e) => Number(e.date.slice(0, 4)) === year);
      const hasActivity = yearEntries.some(
        (e) =>
          e.kind === "auto" ||
          (e.rawTx !== undefined && !isClosingMarkerDescription(e.rawTx.description))
      );
      if (!hasActivity) {
        toast(t("savingsNoEntries"));
        return;
      }
      // A net of exactly 0 is still closable: it writes a carry-forward marker
      // so the year is marked done and later years are not blocked.
      void (async () => {
        try {
          const net = await previewClosingBalance(year);
          const nextYear = year + 1;
          const desc = t("closingBalance", { year });
          setConfirmAction({
            title: t("closeYearLabel"),
            message: t("closeYearConfirm", {
              year,
              amount: formatCurrency(Math.abs(net)),
              nextYear,
            }),
            confirmLabel: t("closeYearLabel"),
            onConfirm: () => {
              return (async () => {
                try {
                  const result = await closeYear(year, desc);
                  if (result.blockedYear !== undefined) {
                    toast(t("closeYearBlocked", { year: result.blockedYear }));
                    setConfirmAction(null);
                    return;
                  }
                  if (!result.created) {
                    toast(t("closeYearNothing", { year }));
                    setConfirmAction(null);
                    return;
                  }
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
        } catch {
          toast.error(t("errorLoadingData"));
        }
      })();
    },
    [entries, t, loadData, haptics]
  );

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) return;
    const amountText = formAmount.trim();
    const parsed = parseNumberInput(amountText, 2);
    if (parsed === null || parsed <= 0) {
      setModalError(t("savingsErrorAmount"));
      return;
    }
    if (!formDate) {
      setModalError(t("savingsErrorDate"));
      return;
    }
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      if (editingKind === "auto") {
        if (!editingMonth) throw new Error("Missing auto-deposit month");
        await updateAutoDeposit(editingMonth, {
          description: formDesc,
          amount: parsed,
        });
      } else if (editingId === null) {
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
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [formType, formDesc, formAmount, formDate, editingId, editingKind, editingMonth, t, loadData, haptics]);

  const requestDelete = useCallback(() => {
    if (editingId === null && editingKind !== "auto") return;
    setConfirmAction({
      title: t("deleteConfirmTitle"),
      message: t("deleteSavingsEntryConfirm"),
      confirmLabel: t("delete"),
      destructive: true,
      onConfirm: () => {
        return (async () => {
          try {
            if (editingKind === "auto") {
              if (!editingMonth) throw new Error("Missing auto-deposit month");
              await deleteAutoDeposit(editingMonth);
            } else if (editingId !== null) {
              await deleteTransaction(editingId);
            }
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
  }, [editingId, editingKind, editingMonth, t, loadData]);

  const renderEntry = useCallback(
    ({ item: entry, index }: ListRenderItemInfo<SavingsEntry>) => {
      const isAuto = entry.kind === "auto";
      const isDeposit = entry.type === "deposit";
      const badgeLabel = isAuto ? t("savingsAutoBadge") : isDeposit ? t("savingsTypeDeposit") : t("savingsTypePurchase");
      const amountColor = isDeposit ? "text-success" : "text-destructive";
      const sign = isDeposit ? "+" : "-";
      const isLast = index === filteredEntries.length - 1;

      const locked = entry.kind === "tx" && entry.rawTx && isClosingMarkerDescription(entry.rawTx.description);
      const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
      return <View className="border-x border-border/60 bg-card px-3">
        <View className={`min-h-[68px] flex-row items-center gap-2.5 py-2.5 ${isLast ? "" : "border-b border-border/60"}`}>
          <View className={`h-[39px] w-[39px] items-center justify-center rounded-[11px] ${isDeposit ? "bg-success/10" : "bg-secondary"}`}><Icon size={18} color={isDeposit ? colors.success : colors.mutedForeground} /></View>
          <Pressable disabled={!!locked} onPress={() => handleTapEntry(entry)} className="min-h-[44px] min-w-0 flex-1 justify-center gap-1" accessibilityRole="button" accessibilityLabel={t("savingsEditEntry")}>
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{entry.description}</Text>
            <Text className="text-xs text-muted-foreground">{entry.date} · {badgeLabel}</Text>
            <Text className={`text-sm font-semibold ${amountColor}`}>{sign}{formatCurrency(entry.amount)}</Text>
          </Pressable>
          {locked ? <View className="h-11 w-11 items-center justify-center" accessible accessibilityRole="image" accessibilityLabel={t("savingsProtected")}><Lock size={18} color={colors.mutedForeground} /></View> : <IconButton icon={Pencil} accessibilityLabel={t("savingsEditEntry")} onPress={() => handleTapEntry(entry)} />}
        </View>
      </View>;
    },
    [filteredEntries.length, t, handleTapEntry, colors.mutedForeground, colors.success]
  );

  const listHeader = useMemo(
    () => (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="gap-1"><Text accessibilityRole="header" className="text-2xl max-[360px]:text-[21px] font-semibold tracking-[-0.4px] text-foreground">{t("tabSavings")}</Text><Text className="text-xs leading-[18px] text-muted-foreground">{t("savingsSubtitle")}</Text></View>
        <Button icon={Plus} label={t("savingsNewEntry")} onPress={() => { void haptics.light(); openCreateModal(); }} />
      </View>
      <SavingsGoalCard goalAmount={goalAmount} balance={summary.balance} />
      {availableYears.some(year => year < currentYear) && <Button className="self-start" variant="secondary" icon={Archive} label={t("savingsClosePrior")} onPress={() => { setClosingYear(availableYears.find(year => year < currentYear) ?? null); setCloseYearOpen(true); }} />}
      <View className="gap-[7px]">
        <Text className="text-[13px] font-semibold text-foreground">{t("savingsYear")}</Text>
        <View ref={yearMenuRef} collapsable={false}>
          <Pressable onPress={openYearMenu} accessibilityRole="button" accessibilityLabel={t("savingsYear")} accessibilityState={{ expanded: yearMenuAnchor !== null }} className="min-h-[44px] flex-row items-center justify-between rounded-[11px] border border-border/60 bg-card px-3 py-2.5">
            <Text className="text-sm text-foreground">{selectedYear === "all" ? t("savingsAllYears") : selectedYear}</Text><ChevronDown size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
      <Text accessibilityRole="header" className="text-[15px] font-semibold text-foreground">{t("activityLabel")}</Text>
      <View className="rounded-t-[14px] border-x border-t border-border/60 bg-card px-3 pt-2">
        {filteredEntries.length === 0 && (
          <View className="items-center gap-1 py-6">
            <Text className="text-sm text-muted-foreground">{t("savingsNoEntries")}</Text>
            <Text className="text-xs text-muted-foreground">{t("savingsNoEntriesHint")}</Text>
          </View>
        )}
      </View>
    </View>
    ),
    [
      t,
      colors,
      goalAmount,
      summary.balance,
      filteredEntries.length,
      availableYears,
      selectedYear,
      currentYear,
      openCreateModal,
      haptics,
      yearMenuRef, openYearMenu, yearMenuAnchor,
    ]
  );

  const listFooter = useMemo(
    () => (
    <View className="gap-3">
      <View className="h-2 rounded-b-[14px] border-x border-b border-border/60 bg-card" />
      <View className="rounded-[14px] border border-border/60 bg-card p-3 gap-1.5">
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
    ),
    [t, summary.totalSaved, summary.totalSpent, summary.balance]
  );

  return (
    <View className="flex-1 bg-background">
      {loadState !== "ready" ? <View className="w-full max-w-md self-center gap-4 p-4">
        <Text accessibilityRole="header" className="text-2xl max-[360px]:text-[21px] font-semibold tracking-[-0.4px] text-foreground">{t("tabSavings")}</Text>
        <View className="items-center gap-3 rounded-xl border border-border bg-card px-4 py-8">
          {loadState === "loading" ? <><ActivityIndicator color={colors.primary} accessibilityLabel={t("loading")} />
            <Text className="text-sm text-muted-foreground">{t("loading")}</Text></>
            : <><Text accessibilityRole="alert" className="text-sm text-destructive">{t("errorLoadingData")}</Text>
              <Button label={t("retry")} onPress={() => void loadData()} /></>}
        </View>
      </View> : <FlatList
        className="w-full max-w-md self-center"
        style={styles.list}
        data={filteredEntries}
        keyExtractor={(entry) => entry.id}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />}

      <AnchoredMenu anchor={yearMenuAnchor} onClose={closeYearMenu} align="start" size="regular" items={[
        { key: "all", label: t("savingsAllYears"), selected: selectedYear === "all", onPress: () => setSelectedYear("all") },
        ...availableYears.map(year => ({ key: String(year), label: String(year), selected: selectedYear === year, onPress: () => setSelectedYear(year) })),
      ]} />
      {closeYearOpen && <FormDialog title={t("savingsClosePrior")} onClose={() => setCloseYearOpen(false)}>
        <Text className="text-[13px] font-semibold text-foreground">{t("savingsYear")}</Text>
        <View ref={closingMenuRef} collapsable={false}><Button variant="secondary" icon={ChevronDown} label={String(closingYear ?? "")} onPress={openClosingMenu} /></View>
        <Text className="text-xs leading-[18px] text-muted-foreground">{t("savingsCloseHelp")}</Text>
        <View className="flex-row justify-end gap-2"><Button variant="secondary" label={t("cancel")} onPress={() => setCloseYearOpen(false)} /><Button label={t("closeYearLabel")} disabled={closingYear === null} onPress={() => { setCloseYearOpen(false); if (closingYear !== null) handleCloseYear(closingYear); }} /></View>
        <AnchoredMenu anchor={closingMenuAnchor} onClose={closeClosingMenu} align="start" size="regular" items={availableYears.filter(year => year < currentYear).map(year => ({ key: String(year), label: String(year), selected: closingYear === year, onPress: () => setClosingYear(year) }))} />
      </FormDialog>}
      <FormDialog visible={showModal} busy={saving} onClose={() => setShowModal(false)} title={editingKind === "auto"
        ? t("savingsAutoEditTitle") : editingId === null ? t("savingsNewEntry") : t("savingsEditEntry")}>
          <View pointerEvents={saving ? "none" : "auto"} className="gap-3">
            {modalError ? <Text className="mt-2 text-sm text-destructive">{modalError}</Text> : null}
            <View className="mt-3 gap-3">
              {editingKind !== "auto" && (
                <View>
                  <Text className="text-[13px] font-semibold text-foreground">{t("savingsEntryType")}</Text>
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
                <Text className="text-[13px] font-semibold text-foreground">{t("savingsAmountLabel")}</Text>
                <TextInput
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  className="mt-[7px] min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View>
                <Text className="text-[13px] font-semibold text-foreground">
                  {editingKind === "auto" ? t("savingsAutoDescriptionLabel") : t("savingsDescriptionLabel")}
                </Text>
                <TextInput
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder={t("savingsDescriptionLabel")}
                  className="mt-[7px] min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              {editingKind !== "auto" && (
                <View>
                  <Text className="text-[13px] font-semibold text-foreground">{t("savingsDateLabel")}</Text>
                  <Pressable onPress={() => setDatePickerVisible(true)} className="mt-[7px] min-h-[44px] justify-center rounded-[11px] border border-border/60 bg-card px-3 py-2.5">
                    <Text className="text-sm text-foreground">{formDate || t("savingsDateLabel")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View className="mt-4 flex-row items-center justify-end gap-2">
              {(editingId !== null || editingKind === "auto") && (
                <Pressable onPress={() => { void haptics.warning(); requestDelete(); }} className="mr-auto min-h-[44px] justify-center" accessibilityRole="button" accessibilityLabel={t("delete")}>
                  <Text className="text-sm font-medium text-destructive">{t("delete")}</Text>
                </Pressable>
              )}
              <Button variant="secondary" label={t("cancel")} disabled={saving} onPress={() => setShowModal(false)} />
              <Button label={t("save")} busy={saving} onPress={() => { void handleSave(); }} />
            </View>
          </View>
      </FormDialog>

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

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 112 },
});
