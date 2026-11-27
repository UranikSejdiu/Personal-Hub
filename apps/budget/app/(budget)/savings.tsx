import { actionErrorOptions } from "../../src/lib/actionErrorOptions";
import { Text, TextInput } from "../../src/components/ui/Typography";
import { useState, useCallback, useMemo, useRef } from "react";
import { View, Pressable, StyleSheet, FlatList, ActivityIndicator, type ListRenderItemInfo } from "react-native";
import { Pencil, ArrowDownLeft, ArrowUpRight, Archive, ChevronDown, Lock } from "../../src/components/AppIcons";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { loadSavingsGoal, loadBudget, currentMonth } from "../../src/lib/budget";
import {
  listSavingsPage,
  listSavingsYears,
  type SavingsEntry,
  deleteAutoDeposit,
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
import { SavingsGoalCard } from "../../src/components/SavingsGoalCard";
import { FormDialog } from "../../src/components/ui/FormDialog";
import { AnchoredMenu, useAnchoredMenu } from "../../src/components/ui/AnchoredMenu";
import { Button, IconButton } from "../../src/components/ui/Button";
import { parseNumberInput } from "../../src/lib/numberInput";

function todayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function SavingsScreen() {
  const colors = useThemeColors();
  const [goalAmount, setGoalAmount] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const loadSequence = useRef(0);
  const focused = useRef(false);
  const [entries, setEntries] = useState<SavingsEntry[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const page = useRef({ offset: 0, hasMore: false, loading: false });
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


  const loadData = useCallback(async () => {
    const request = ++loadSequence.current;
    if (!focused.current) return;
    setLoadState("loading");
    try {
      const [sg, firstPage, years, sum, monthlyBudget] = await Promise.all([
        loadSavingsGoal(),
        listSavingsPage(selectedYear, 0),
        listSavingsYears(),
        getSavingsSummary(),
        loadBudget(currentMonth()),
      ]);
      if (!focused.current || request !== loadSequence.current) return;
      setGoalAmount(monthlyBudget?.savings_goal ?? sg.goal_amount);
      setSummary(sum);

      page.current = { offset: firstPage.entries.length, hasMore: firstPage.hasMore, loading: false };
      setEntries(firstPage.entries);
      setAvailableYears(years.length ? years : [new Date().getFullYear()]);
      setLoadState("ready");
    } catch {
      if (focused.current && request === loadSequence.current) {
        setLoadState("failed");
        toast.error("Failed to load data.", actionErrorOptions);
      }
    }
  }, [selectedYear]);

  const loadMore = useCallback(async () => {
    const cursor = page.current;
    if (!focused.current || loadState !== "ready" || cursor.loading || !cursor.hasMore) return;
    const request = loadSequence.current;
    cursor.loading = true;
    try {
      const next = await listSavingsPage(selectedYear, cursor.offset);
      if (!focused.current || request !== loadSequence.current) return;
      setEntries(previous => [...previous, ...next.entries]);
      cursor.offset += next.entries.length;
      cursor.hasMore = next.hasMore;
    } catch {
      if (focused.current && request === loadSequence.current) toast.error("Failed to load more entries.", actionErrorOptions);
    } finally {
      cursor.loading = false;
    }
  }, [loadState, selectedYear]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void loadData();
      return () => { focused.current = false; ++loadSequence.current; };
    }, [loadData])
  );

  const currentYear = new Date().getFullYear();
  const openCreateModal = useCallback((type: SavingsEntryType = "deposit") => {
    setEditingId(null);
    setEditingMonth(null);
    setEditingKind("tx");
    setFormType(type);
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
      // A net of exactly 0 is still closable: it writes a carry-forward marker
      // so the year is marked done and later years are not blocked.
      void (async () => {
        try {
          const net = await previewClosingBalance(year);
          const nextYear = year + 1;
          const desc = `Closing balance ${year}`;
          setConfirmAction({
            title: "Close year",
            message: `Close ${year}? Net savings: ${formatCurrency(net)}. A carry-forward entry will be created in ${nextYear}.`,
            confirmLabel: "Close year",
            onConfirm: () => {
              return (async () => {
                try {
                  const result = await closeYear(year, desc);
                  if (result.blockedYear !== undefined) {
                    toast.warning(`Close ${result.blockedYear} first — it still has open activity.`);
                    setConfirmAction(null);
                    return;
                  }
                  if (!result.created) {
                    toast.info(`Nothing to close for ${year}.`);
                    setConfirmAction(null);
                    return;
                  }
                  await loadData();
                  setSelectedYear(nextYear);
                  setConfirmAction(null);

                  toast.success("Year closed");
                } catch {
                  toast.error("Failed to add entry.", actionErrorOptions);
                  setConfirmAction(null);
                }
              })();
            },
          });
        } catch {
          toast.error("Failed to load data.", actionErrorOptions);
        }
      })();
    },
    [loadData]
  );

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) return;
    const amountText = formAmount.trim();
    const parsed = parseNumberInput(amountText, 2);
    if (parsed === null || parsed <= 0) {
      setModalError("Please enter an amount greater than zero.");
      return;
    }
    if (!formDate) {
      setModalError("Please select a date.");
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
      toast.success(editingKind === "auto" || editingId !== null ? "Entry updated" : formType === "deposit" ? "Deposit added" : "Withdrawal added");
      await loadData();

    } catch {
      const message = editingId === null ? "Failed to add entry." : "Failed to update entry.";
      setModalError(message);
      toast.error(message);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [formType, formDesc, formAmount, formDate, editingId, editingKind, editingMonth, loadData]);

  const requestDelete = useCallback(() => {
    if (editingId === null && editingKind !== "auto") return;
    setConfirmAction({
      title: "Delete",
      message: "Delete this entry?",
      confirmLabel: "Delete",
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
            toast.success("Entry deleted");
            await loadData();
            setConfirmAction(null);
          } catch {
            toast.error("Failed to delete entry.", actionErrorOptions);
            setConfirmAction(null);
          }
        })();
      },
    });
  }, [editingId, editingKind, editingMonth, loadData]);

  const renderEntry = useCallback(
    ({ item: entry, index }: ListRenderItemInfo<SavingsEntry>) => {
      const isAuto = entry.kind === "auto";
      const isDeposit = entry.type === "deposit";
      const badgeLabel = isAuto ? "Auto" : isDeposit ? "Deposit" : "Withdraw";
      const amountColor = isDeposit ? "text-deposit" : "text-withdraw";
      const sign = isDeposit ? "+" : "-";
      const isLast = index === entries.length - 1;

      const locked = entry.kind === "tx" && entry.rawTx && isClosingMarkerDescription(entry.rawTx.description);
      const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
      return <View className={`border-x border-border bg-surface px-4 ${index === 0 ? "rounded-t-[24px] border-t pt-1" : ""} ${isLast ? "rounded-b-[24px] border-b pb-1" : ""}`}>
        <View className={`min-h-[62px] flex-row items-center gap-3 py-2 ${isLast ? "" : "border-b border-border"}`}>
          <View className={`h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isDeposit ? "bg-deposit-container" : "bg-withdraw-container"}`}><Icon size={18} color={isDeposit ? colors.deposit : colors.withdraw} /></View>
          <Pressable disabled={!!locked} onPress={() => handleTapEntry(entry)} className="min-h-[44px] min-w-0 flex-1 justify-center gap-1" accessibilityRole="button" accessibilityLabel="Edit Entry">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{entry.description}</Text>
            <Text className="text-xs text-muted-foreground">{entry.date} · {badgeLabel}</Text>
            <Text className={`text-sm font-semibold ${amountColor}`}>{sign}{formatCurrency(entry.amount)}</Text>
          </Pressable>
          {locked ? <View className="h-11 w-11 items-center justify-center" accessible accessibilityRole="image" accessibilityLabel="Protected opening balance"><Lock size={18} color={colors.mutedForeground} /></View> : <IconButton icon={Pencil} accessibilityLabel="Edit Entry" onPress={() => handleTapEntry(entry)} />}
        </View>
      </View>;
    },
    [entries.length, handleTapEntry, colors.mutedForeground, colors.deposit, colors.withdraw]
  );

  const listHeader = useMemo(
    () => (
    <View className={entries.length ? "mb-3 gap-4" : "gap-4"}>
      <View className="min-h-[48px] justify-center">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">Savings</Text>
      </View>
      <SavingsGoalCard goalAmount={goalAmount} {...summary} />
      <View className="flex-row gap-2">
        <Button className="flex-1 rounded-[16px]" variant="deposit" icon={ArrowDownLeft} label="Deposit" onPress={() => openCreateModal("deposit")} />
        <Button className="flex-1 rounded-[16px]" variant="withdraw" icon={ArrowUpRight} label="Withdraw" onPress={() => openCreateModal("purchase")} />
      </View>
      {availableYears.some(year => year < currentYear) && <Button className="self-start" variant="text" icon={Archive} label="Close prior year" onPress={() => { setClosingYear(availableYears.find(year => year < currentYear) ?? null); setCloseYearOpen(true); }} />}
      <View className="flex-row flex-wrap items-center justify-between gap-x-3">
        <Text accessibilityRole="header" className="min-w-0 shrink text-base font-semibold text-foreground">Savings activity</Text>
        <View ref={yearMenuRef} collapsable={false} className="max-w-full">
          <Pressable onPress={openYearMenu} accessibilityRole="button" accessibilityLabel="Year"
            accessibilityValue={{ text: selectedYear === "all" ? "All years" : String(selectedYear) }}
            accessibilityState={{ expanded: yearMenuAnchor !== null }}
            className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-secondary-container px-3">
            <Text className="shrink text-label-medium font-medium text-on-secondary-container">{selectedYear === "all" ? "All years" : selectedYear}</Text>
            <ChevronDown size={16} color={colors.onSecondaryContainer} />
          </Pressable>
        </View>
      </View>
      {entries.length === 0 ? (
        <View className="rounded-[24px] border border-border bg-surface px-4 py-6">
          <Text className="text-center text-sm text-muted-foreground">No entries yet.</Text>
        </View>
      ) : null}
    </View>
    ),
    [
      colors,
      goalAmount,
      summary,
      entries.length,
      availableYears,
      selectedYear,
      currentYear,
      openCreateModal,
      yearMenuRef, openYearMenu, yearMenuAnchor,
    ]
  );

  return (
    <View className="flex-1 bg-background">
      {loadState !== "ready" ? <View className="w-full gap-4 px-page pt-4">
        <View className="min-h-[48px] justify-center">
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">Savings</Text>
        </View>
        <View className="items-center gap-3 rounded-[24px] border border-border bg-surface px-4 py-8">
          {loadState === "loading" ? <><ActivityIndicator color={colors.primary} accessibilityLabel="Loading…" />
            <Text className="text-sm text-muted-foreground">Loading…</Text></>
            : <><Text accessibilityRole="alert" className="text-sm text-destructive">Failed to load data.</Text>
              <Button label="Retry" onPress={() => void loadData()} /></>}
        </View>
      </View> : <FlatList
        className="w-full"
        style={styles.list}
        data={entries}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        keyExtractor={(entry) => entry.id}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-page"
        contentContainerStyle={styles.listContent}
      />}

      <AnchoredMenu anchor={yearMenuAnchor} onClose={closeYearMenu} align="start" size="regular" items={[
        { key: "all", label: "All years", selected: selectedYear === "all", onPress: () => setSelectedYear("all") },
        ...availableYears.map(year => ({ key: String(year), label: String(year), selected: selectedYear === year, onPress: () => setSelectedYear(year) })),
      ]} />
      {closeYearOpen && <FormDialog title="Close prior year" onClose={() => setCloseYearOpen(false)}>
        <Text className="text-[13px] font-semibold text-foreground">Year</Text>
        <View ref={closingMenuRef} collapsable={false}><Button variant="secondary" icon={ChevronDown} label={String(closingYear ?? "")} onPress={openClosingMenu} /></View>
        <Text className="text-xs leading-[18px] text-muted-foreground">Carry the closing balance into an opening balance for the next year. Opening balance entries are protected.</Text>
        <View className="flex-row justify-end gap-2"><Button variant="secondary" label="Cancel" onPress={() => setCloseYearOpen(false)} /><Button label="Close year" disabled={closingYear === null} onPress={() => { setCloseYearOpen(false); if (closingYear !== null) handleCloseYear(closingYear); }} /></View>
        <AnchoredMenu anchor={closingMenuAnchor} onClose={closeClosingMenu} align="start" size="regular" items={availableYears.filter(year => year < currentYear).map(year => ({ key: String(year), label: String(year), selected: closingYear === year, onPress: () => setClosingYear(year) }))} />
      </FormDialog>}
      <FormDialog visible={showModal} busy={saving} onClose={() => setShowModal(false)} title={editingKind === "auto"
        ? "Edit Auto Deposit" : editingId === null ? "Add entry" : "Edit Entry"}>
          <View pointerEvents={saving ? "none" : "auto"} className="gap-3">
            {modalError ? <Text className="mt-2 text-sm text-destructive">{modalError}</Text> : null}
            <View className="mt-3 gap-3">
              {editingKind !== "auto" && (
                <View>
                  <Text className="text-[13px] font-semibold text-foreground">Type</Text>
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
                          <Icon size={16} color={typeOption === "deposit" ? colors.deposit : colors.withdraw} />
                          <Text className={typeOption === "deposit" ? "text-deposit" : "text-withdraw"}>
                            {typeOption === "deposit" ? "Deposit" : "Withdraw"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              <View>
                <Text className="text-[13px] font-semibold text-foreground">Amount (€)</Text>
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
                  {editingKind === "auto" ? "Description (optional)" : "Description (optional)"}
                </Text>
                <TextInput
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Description (optional)"
                  className="mt-[7px] min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              {editingKind !== "auto" && (
                <View>
                  <Text className="text-[13px] font-semibold text-foreground">Date</Text>
                  <Pressable onPress={() => setDatePickerVisible(true)} className="mt-[7px] min-h-[44px] justify-center rounded-[11px] border border-border/60 bg-card px-3 py-2.5">
                    <Text className="text-sm text-foreground">{formDate || "Date"}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View className="mt-4 flex-row items-center justify-end gap-2">
              {(editingId !== null || editingKind === "auto") && (
                <Pressable onPress={() => { requestDelete(); }} className="mr-auto min-h-[44px] justify-center" accessibilityRole="button" accessibilityLabel="Delete">
                  <Text className="text-sm font-medium text-destructive">Delete</Text>
                </Pressable>
              )}
              <Button variant="secondary" label="Cancel" disabled={saving} onPress={() => setShowModal(false)} />
              <Button label="Save" busy={saving} onPress={() => { void handleSave(); }} />
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
        title={confirmAction?.title ?? "Delete"}
        message={confirmAction?.message ?? ""}
        confirmLabel={confirmAction?.confirmLabel ?? "Confirm"}
        cancelLabel="Cancel"
        destructive={confirmAction?.destructive ?? true}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingTop: 16, paddingBottom: 16 },
});
