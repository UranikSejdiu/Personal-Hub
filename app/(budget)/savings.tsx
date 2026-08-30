import { useEffect, useState, useCallback, startTransition } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { Plus, Trash2, CircleCheck, ArrowDownLeft, ArrowUpRight } from "lucide-react-native";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import {
  loadSavingsGoal,
} from "../../src/lib/budget";
import {
  listAutoDeposits,
  deleteAutoDeposit,
  listTransactions,
  addTransaction,
  deleteTransaction,
  updateTransaction,
  getSavingsSummary,
  type AutoDeposit,
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

interface ConfirmAction {
  message: string;
  onConfirm: () => void;
}

export default function SavingsScreen() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [goalAmount, setGoalAmount] = useState(0);
  const [autoDeposits, setAutoDeposits] = useState<AutoDeposit[]>([]);
  const [transactions, setTransactions] = useState<SavingsTransaction[]>([]);
  const [summary, setSummary] = useState<SavingsSummary>({ balance: 0, totalSaved: 0, totalSpent: 0 });

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

  const loadData = useCallback(async () => {
    const [sg, ads, txs, sum] = await Promise.all([
      loadSavingsGoal(),
      listAutoDeposits(),
      listTransactions(),
      getSavingsSummary(),
    ]);
    setGoalAmount(sg.goal_amount);
    setAutoDeposits(ads);
    setTransactions(txs);
    setSummary(sum);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
  }, [loadData]);

  const handleDeleteAutoDeposit = useCallback(
    async (month: string) => {
      await deleteAutoDeposit(month);
      loadData();
    },
    [loadData]
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
      toast.error(
        editingId === null ? t("errorAddingSavings") : t("errorUpdatingSavings")
      );
    } finally {
      setSaving(false);
    }
  }, [
    formType,
    formDesc,
    formAmount,
    formDate,
    editingId,
    t,
    loadData,
    haptics,
  ]);

  const requestDelete = useCallback(() => {
    if (editingId === null) return;
    setConfirmAction({
      message: t("deleteSavingsEntryConfirm"),
      onConfirm: () => {
        void (async () => {
          try {
            await deleteTransaction(editingId);
            setShowModal(false);
            await loadData();
          } catch {
            toast.error(t("errorDeletingSavings"));
          }
        })();
        setConfirmAction(null);
      },
    });
  }, [editingId, t, loadData]);

  const requestDeleteTx = useCallback(
    (id: number) => {
      setConfirmAction({
        message: t("deleteSavingsEntryConfirm"),
        onConfirm: () => {
          void (async () => {
            try {
              await deleteTransaction(id);
              await loadData();
            } catch {
              toast.error(t("errorDeletingSavings"));
            }
          })();
          setConfirmAction(null);
        },
      });
    },
    [t, loadData]
  );

   const [datePickerVisible, setDatePickerVisible] = useState(false);

   const goalMet = goalAmount > 0 && summary.balance >= goalAmount;
   const goalProgress = goalAmount > 0 ? Math.min(100, (summary.balance / goalAmount) * 100) : 0;

   return (
    <>
      <ScrollView className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        <Text className="text-xl font-bold text-foreground">{t("tabSavings")}</Text>

        {/* Goal progress */}
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
              <View
                className={`h-full rounded-full ${goalMet ? "bg-success" : "bg-primary"}`}
                style={{ width: `${goalProgress}%` }}
              />
            </View>
          </View>
        )}

        {/* Auto-deposits */}
        <View className="rounded-xl border border-border bg-card p-4">
          <Text className="mb-3 text-base font-semibold text-foreground">{t("autoDepositsLabel")}</Text>
          {autoDeposits.length === 0 ? (
            <Text className="py-2 text-center text-sm text-muted-foreground">{t("noAutoDeposits")}</Text>
          ) : (
            <View className="gap-2">
              {autoDeposits.map((dep) => (
                <View key={dep.month} className="flex-row items-center justify-between rounded-lg bg-muted/40 p-3">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">{dep.month}</Text>
                    <Text className="text-xs text-muted-foreground">{t("savingsMonthlyDepositDesc")}</Text>
                  </View>
                  <Text className="text-sm font-medium text-foreground">{formatCurrency(dep.amount)}</Text>
                  <Pressable
                    onPress={() => handleDeleteAutoDeposit(dep.month)}
                    className="ml-2 p-1"
                  >
                    <Trash2 size={18} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Transactions */}
        <View className="rounded-xl border border-border bg-card p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-foreground">{t("transactionsLabel")}</Text>
            <Pressable
              onPress={openCreateModal}
              className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5"
            >
              <Plus size={14} color={colors.primaryForeground} />
              <Text className="text-xs font-medium text-primary-foreground">{t("savingsNewEntry")}</Text>
            </Pressable>
          </View>

          {transactions.length === 0 ? (
            <Text className="py-2 text-center text-sm text-muted-foreground">{t("noTransactions")}</Text>
          ) : (
            <View className="gap-2">
              {transactions.map((tx) => (
                <Pressable
                  key={tx.id}
                  onPress={() => openEditModal(tx)}
                  className="flex-row items-center justify-between rounded-lg bg-muted/40 p-3"
                >
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">
                      {tx.description || t("transaction")}
                    </Text>
                    <Text className="text-xs text-muted-foreground">{tx.date}</Text>
                  </View>
                  <Text className={`text-sm font-medium ${tx.type === "deposit" ? "text-success" : "text-destructive"}`}>
                    {tx.type === "deposit" ? "+" : "-"}{formatCurrency(tx.amount)}
                  </Text>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      void haptics.warning();
                      requestDeleteTx(tx.id);
                    }}
                    className="ml-2 p-1"
                  >
                    <Trash2 size={18} color={colors.mutedForeground} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Totals */}
        <View className="rounded-xl border border-border bg-card p-4 gap-1">
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">{t("totalSaved")}</Text>
            <Text className="text-sm font-semibold text-foreground">{formatCurrency(summary.totalSaved)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">{t("totalSpent")}</Text>
            <Text className="text-sm font-medium text-foreground">{formatCurrency(summary.totalSpent)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm font-semibold text-foreground">{t("savingsBalanceLabel")}</Text>
            <Text className="text-sm font-semibold text-success">{formatCurrency(summary.balance)}</Text>
          </View>
        </View>
      </View>
    </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 px-4"
          onPress={() => setShowModal(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card p-5"
          >
            <Text className="text-lg font-semibold text-foreground">
              {editingId === null ? t("savingsNewEntry") : t("savingsEditEntry")}
            </Text>

            {modalError ? (
              <Text className="mt-2 text-sm text-red-500">{modalError}</Text>
            ) : null}

            <View className="mt-4 gap-4">
              {!(editingId !== null && editingKind === "auto") && (
                <View>
                  <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">
                    {t("savingsEntryType")}
                  </Text>
                  <View className="mt-1 flex-row gap-2">
                    {(["deposit", "purchase"] as const).map((typeOption) => {
                      const Icon =
                        typeOption === "deposit" ? ArrowDownLeft : ArrowUpRight;
                      const active = formType === typeOption;
                      return (
                        <Pressable
                          key={typeOption}
                          onPress={() => setFormType(typeOption)}
                          className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border px-3 py-2.5 ${
                            active
                              ? "border-primary bg-muted"
                              : "border-border"
                          }`}
                        >
                          <Icon
                            size={16}
                            color={typeOption === "deposit" ? "#22c55e" : "#ef4444"}
                          />
                          <Text
                            className={
                              typeOption === "deposit" ? "text-success" : "text-destructive"
                            }
                          >
                            {typeOption === "deposit"
                              ? t("savingsTypeDeposit")
                              : t("savingsTypePurchase")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <View>
                <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">
                  {t("savingsAmountLabel")}
                </Text>
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
                  <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">
                    {t("savingsDescriptionLabel")}
                  </Text>
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
                  <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">
                    {t("savingsDateLabel")}
                  </Text>
                  <Pressable
                    onPress={() => setDatePickerVisible(true)}
                    className="mt-1 rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    <Text className="text-sm text-foreground">
                      {formDate || t("savingsDateLabel")}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View className="mt-5 flex-row items-center justify-end gap-2">
              {editingId !== null && (
                <Pressable onPress={requestDelete} className="px-2 py-1">
                  <Text className="text-sm font-medium text-red-500">
                    {t("delete")}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setShowModal(false)}
                className="px-2 py-1"
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  {t("cancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSave()}
                disabled={saving}
                className="rounded-lg bg-primary px-4 py-2"
              >
                <Text className="text-sm font-medium text-primary-foreground">
                  {t("save")}
                </Text>
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
        title={t("deleteConfirmTitle")}
        message={confirmAction?.message ?? ""}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        destructive
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction?.onConfirm()}
      />
    </>
  );
}
