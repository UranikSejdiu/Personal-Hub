import { Text } from "../../src/components/ui/Typography";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, ScrollView, Keyboard, Pressable, FlatList, type ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { useI18n, monthLabelShort } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import {
  loadLoans,
  computeMonthSummary,
  loadBudget,
  createBudgetMonth,
  loadSavingsGoal,
  saveMonthPreferences,
  listExpenses,
  addExpense,
  updateExpense,
  setExpenseRecurring,
  removeExpense,
  copyBudgetFromMonth,
  currentMonth,
  addMonths,
  type Loans,
  type Budget,
  type Expense,
} from "../../src/lib/budget";
import { listRepaymentPlans, paidRepaymentIds, setRepaymentPaid, type RepaymentPlan } from "../../src/lib/repaymentPlans";
import { RepaymentPaymentSection } from "../../src/components/RepaymentPaymentSection";
import { CustomExpensesHeader, CustomExpenseRow } from "../../src/components/CustomExpensesSection";
import { MonthlySummarySection } from "../../src/components/MonthlySummarySection";
import { BudgetMonthEditor } from "../../src/components/BudgetMonthEditor";
import { Button, IconButton } from "../../src/components/ui/Button";
import { ArrowLeft, Pencil } from "../../src/components/AppIcons";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { formatCurrency } from "../../src/lib/utils";

const renderBudgetScroll = (props: ScrollViewProps) => <KeyboardAwareScrollView {...props} className="flex-1 bg-background" bottomOffset={16} />;

export default function BudgetScreen() {
  const router = useRouter();
  const [editingMonth, setEditingMonth] = useState(false);
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  const initialMonth = monthParam && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : currentMonth();
  const { t, lang } = useI18n();
  const haptics = useHaptics();
  const month = initialMonth;

  const [loans, setLoans] = useState<Loans | null>(null);
  const [repayments, setRepayments] = useState<RepaymentPlan[]>([]);
  const [paidRepayments, setPaidRepayments] = useState<Set<number>>(new Set());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const expensesRef = useRef<Expense[]>([]);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);
  const [hasPreviousBudget, setHasPreviousBudget] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingsGoal, setSavingsGoal] = useState(0);

  const tRef = useRef(t);
  const budgetIdRef = useRef<number | null>(null);
  const loadRequestRef = useRef(0);
  const toggleInFlightRef = useRef(false);
  const expensePendingRef = useRef(new Map<number, Partial<Pick<Expense, "category" | "amount">>>());
  const expenseQueuedIdsRef = useRef(new Set<number>());
  const expenseQueueRef = useRef<Promise<void>>(Promise.resolve());
  const expenseEditRevisionRef = useRef(new Map<number, number>());

  const flushExpenseUpdate = useCallback(async (id: number) => {
    const pending = expensePendingRef.current.get(id);
    expensePendingRef.current.delete(id);
    if (!pending) return;
    const revision = expenseEditRevisionRef.current.get(id);
    try {
      await updateExpense(id, pending);
    } catch {
      try {
        const budgetId = budgetIdRef.current;
        if (revision === expenseEditRevisionRef.current.get(id) &&
            !expensePendingRef.current.has(id) && budgetId !== null) {
          const savedExpense = (await listExpenses(budgetId)).find((expense) => expense.id === id);
          if (savedExpense && revision === expenseEditRevisionRef.current.get(id) &&
              budgetId === budgetIdRef.current) {
            setExpenses((current) => current.map((expense) => expense.id === id
              ? { ...expense, category: savedExpense.category, amount: savedExpense.amount }
              : expense));
          }
        }
      } catch {
        // Keep optimistic values when reload also fails; user sees the toast.
      }
      toast.error(tRef.current("errorUpdatingExpense"));
    }
  }, []);

  const scheduleExpenseUpdate = useCallback(
    (
      id: number,
      fields: Partial<Pick<Expense, "category" | "amount">>
    ) => {
      expenseEditRevisionRef.current.set(id, (expenseEditRevisionRef.current.get(id) ?? 0) + 1);
      const existing = expensePendingRef.current.get(id);
      expensePendingRef.current.set(id, { ...existing, ...fields });
      if (expenseQueuedIdsRef.current.has(id)) return;
      expenseQueuedIdsRef.current.add(id);
      expenseQueueRef.current = expenseQueueRef.current.then(async () => {
        try {
          while (expensePendingRef.current.has(id)) await flushExpenseUpdate(id);
        } finally {
          expenseQueuedIdsRef.current.delete(id);
        }
      });
    },
    [flushExpenseUpdate]
  );

  const cancelExpenseUpdate = useCallback((id: number) => {
    expenseEditRevisionRef.current.set(id, (expenseEditRevisionRef.current.get(id) ?? 0) + 1);
    expensePendingRef.current.delete(id);
  }, []);

  const flushAllExpenseUpdates = useCallback(async () => {
    let pending: Promise<void>;
    do {
      pending = expenseQueueRef.current;
      await pending;
    } while (pending !== expenseQueueRef.current);
  }, []);

  const previousMonth = addMonths(month, -1);
  const previousMonthLabel = monthLabelShort(lang, previousMonth);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const loadData = useCallback(async (m: string) => {
    const request = ++loadRequestRef.current;
    const [l, b, pb, sg, plans, paidPlans] = await Promise.all([
      loadLoans(),
      loadBudget(m),
      loadBudget(addMonths(m, -1)),
      loadSavingsGoal(),
      listRepaymentPlans(),
      paidRepaymentIds(m),
    ]);
    if (request !== loadRequestRef.current) return;
    setLoans(l);
    setRepayments(plans);
    setPaidRepayments(paidPlans);
    setHasPreviousBudget(!!pb);
    setSavingsGoal(b?.savings_goal ?? sg.goal_amount);
    budgetIdRef.current = b ? b.id : null;
    if (b) {
      const exps = await listExpenses(b.id);
      if (request !== loadRequestRef.current) return;
      setExpenses(exps);
    } else {
      setExpenses([]);
    }
    const seedIncome = b ? b.income : sg.salary;
    setBudget(
      b ?? {
        id: 0,
        month: m,
        income: seedIncome,
        savings_goal: sg.goal_amount,
        loan_paid: false,
        cc_paid: false,
        cc2_paid: false,
        updated_at: "",
      }
    );
    setLoadError(null);
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await flushAllExpenseUpdates();
        if (cancelled) return;
        await loadData(month);
        if (cancelled) return;
      } catch {
        if (!cancelled) setLoadError(t("errorLoadingData"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ++loadRequestRef.current;
    };
  }, [month, loadData, t, flushAllExpenseUpdates]));

  const ensureBudget = useCallback(async (): Promise<Budget> => {
    // `id === 0` is the unsaved placeholder created by loadData for a month
    // with no row yet; it must be persisted before expenses can reference it.
    if (budget && budget.id !== 0) return budget;
    const { budget: b } = await createBudgetMonth(month);
    setBudget(b);
    setSavingsGoal(b.savings_goal);
    budgetIdRef.current = b.id;
    return b;
  }, [month, budget]);

  const handleRepaymentToggle = useCallback(async (planId: number) => {
    if (toggleInFlightRef.current) return;
    toggleInFlightRef.current = true;
    const nextPaid = !paidRepayments.has(planId);
    try {
      await ensureBudget();
      const updated = await setRepaymentPaid(planId, month, nextPaid);
      setRepayments((current) => current.map((plan) => plan.id === planId ? updated : plan));
      setPaidRepayments((current) => {
        const next = new Set(current);
        if (nextPaid) next.add(planId);
        else next.delete(planId);
        return next;
      });
      void haptics.light();
    } catch {
      toast.error(t("errorUpdatingLoan"));
    } finally {
      toggleInFlightRef.current = false;
    }
  }, [paidRepayments, ensureBudget, month, haptics, t]);

  const handleAddExpense = useCallback(async () => {
    try {
      const b = await ensureBudget();
      await addExpense(b.id, "", 0, false);
      const exps = await listExpenses(b.id);
      setExpenses(exps);
      void haptics.light();
    } catch {
      toast.error(t("errorUpdatingExpense"));
    }
  }, [ensureBudget, haptics, t]);

  const handleUpdateExpense = useCallback(
    async (
      id: number,
      fields: Partial<Pick<Expense, "category" | "amount" | "paid">>
    ) => {
      const prevExpense = expensesRef.current.find((e) => e.id === id);
      setExpenses((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...fields } : e))
      );

      const textFields: Partial<Pick<Expense, "category" | "amount">> = {};
      if (fields.category !== undefined) textFields.category = fields.category;
      if (fields.amount !== undefined) textFields.amount = fields.amount;
      if (Object.keys(textFields).length > 0) {
        scheduleExpenseUpdate(id, textFields);
      }

      if (fields.paid !== undefined) {
        try {
          await updateExpense(id, { paid: fields.paid });
        } catch {
          if (prevExpense) {
            setExpenses((prev) =>
              prev.map((e) =>
                e.id === id ? { ...e, paid: prevExpense.paid } : e
              )
            );
          }
          toast.error(t("errorUpdatingExpense"));
        }
      }
    },
    [t, scheduleExpenseUpdate]
  );

  const handleToggleRecurring = useCallback(
    async (expense: Expense, next: boolean) => {
      const prevExpense = expensesRef.current.find((e) => e.id === expense.id);
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expense.id ? { ...e, is_recurring: next } : e
        )
      );
      try {
        await flushAllExpenseUpdates();
        await setExpenseRecurring(expense.id, expense.category, expense.amount, next);
      } catch {
        if (prevExpense) {
          setExpenses((prev) =>
            prev.map((e) => (e.id === expense.id ? prevExpense : e))
          );
        }
        toast.error(t("errorUpdatingExpense"));
      }
    },
    [t, flushAllExpenseUpdates]
  );

  const handleRemoveExpense = useCallback(
    async (id: number) => {
      try {
        await flushAllExpenseUpdates();
        await removeExpense(id);
        cancelExpenseUpdate(id);
        setExpenses((curr) => curr.filter((e) => e.id !== id));
        setExpenseToDelete(null);
        void haptics.warning();
      } catch {
        toast.error(t("errorRemovingExpense"));
      }
    },
    [t, haptics, cancelExpenseUpdate, flushAllExpenseUpdates]
  );

  const askRemoveExpense = useCallback((id: number) => {
    const expense = expensesRef.current.find((item) => item.id === id);
    if (expense) setExpenseToDelete(expense);
  }, []);

  const handleCopyPrevious = useCallback(async () => {
    if (loading) return;
    try {
      await flushAllExpenseUpdates();
      const result = await copyBudgetFromMonth(previousMonth, month);
      setBudget(result.budget);
      setSavingsGoal(result.budget.savings_goal);
      budgetIdRef.current = result.budget.id;
      setExpenses(result.expenses);
      void haptics.success();
      toast.success(
        t("copiedFromPreviousMonth", { month: previousMonthLabel })
      );
    } catch {
      toast.error(t("noPreviousMonthFound"));
    }
  }, [month, previousMonth, previousMonthLabel, loading, t, haptics, flushAllExpenseUpdates]);

  useEffect(() => {
    return () => {
      void flushAllExpenseUpdates();
    };
  }, [flushAllExpenseUpdates]);

  const monthSummary = useMemo(() => budget && loans ? computeMonthSummary({
    month: budget.month, income: budget.income, loanPaid: budget.loan_paid, ccPaid: budget.cc_paid, cc2Paid: budget.cc2_paid,
    totalExpenses: expenses.reduce((total, expense) => total + expense.amount, 0),
    paidExpenses: expenses.reduce((total, expense) => total + (expense.paid ? expense.amount : 0), 0),
  }, loans, savingsGoal, repayments, paidRepayments) : null, [budget, loans, expenses, savingsGoal, repayments, paidRepayments]);

  if (loading || !loans || !budget) {
    if (loadError) {
      return (
        <ScrollView className="flex-1 bg-background" keyboardDismissMode="on-drag" onTouchStart={() => Keyboard.dismiss()}>
          <View className="w-full max-w-md self-center items-center gap-4 p-4 pb-28 pt-20">
            <Text className="text-center text-sm text-destructive">{loadError}</Text>
            <Pressable
              onPress={() => {
                setLoadError(null);
                setLoading(true);
                void (async () => {
                  try {
                    await loadData(month);
                  } catch {
                    setLoadError(t("errorLoadingData"));
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              className="rounded-lg bg-primary px-4 py-2"
            >
              <Text className="text-sm font-medium text-primary-foreground">{t("retry")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      );
    }
    return (
      <ScrollView className="flex-1 bg-background" keyboardDismissMode="on-drag" onTouchStart={() => Keyboard.dismiss()}>
        <View className="w-full max-w-md self-center gap-3 px-4 pt-3 pb-28">
          <View className="flex-row items-center justify-between">
            <View className="h-8 w-48 animate-pulse rounded bg-muted" />
            <View className="h-9 w-40 animate-pulse rounded bg-muted" />
          </View>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={`skeleton-${i}`}
              className="space-y-4 rounded-lg border bg-card p-6"
            >
              <View className="h-5 w-40 animate-pulse rounded bg-muted" />
              <View className="grid grid-cols-1 gap-3">
                {[1, 2, 3].map((j) => (
                  <View key={j} className="space-y-2">
                    <View className="h-3 w-24 animate-pulse rounded bg-muted" />
                    <View className="h-9 w-full animate-pulse rounded bg-muted" />
                  </View>
                ))}
              </View>
              <View className="h-24 w-full animate-pulse rounded bg-muted" />
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <><FlatList
      className="flex-1 bg-background"
      contentContainerClassName="w-full max-w-md self-center px-4 pt-3 pb-28"
      data={expenses}
      keyExtractor={(expense) => String(expense.id)}
      renderScrollComponent={renderBudgetScroll}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={false}
      renderItem={({ item, index }) => (
        <View className="border-x border-border bg-card px-3">
          <CustomExpenseRow expense={item} isLast={index === expenses.length - 1} onUpdate={handleUpdateExpense} onRemove={askRemoveExpense} onToggleRecurring={handleToggleRecurring} />
        </View>
      )}
      ListHeaderComponent={
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <IconButton icon={ArrowLeft} accessibilityLabel={t("navDashboard")} onPress={() => router.canGoBack() ? router.back() : router.replace("/(budget)")} />
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-xl font-semibold text-foreground">{monthLabelShort(lang, month)}</Text>
            <IconButton icon={Pencil} accessibilityLabel={t("monthEditTitle")} onPress={() => setEditingMonth(true)} />
          </View>
          <View className="gap-2 rounded-xl border border-border/60 bg-card p-3">
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[112px] flex-1 gap-1"><Text className="text-xs text-muted-foreground">{t("dashboardPlannedRemaining")}</Text><Text className={`text-base font-semibold ${(monthSummary?.remaining ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(monthSummary?.remaining ?? 0)}</Text></View>
              <View className="min-w-[112px] flex-1 gap-1"><Text className="text-xs text-muted-foreground">{t("dashboardActualRemaining")}</Text><Text className={`text-base font-semibold ${(monthSummary?.actualRemaining ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(monthSummary?.actualRemaining ?? 0)}</Text></View>
            </View>
            <Button variant="secondary" icon={Pencil} label={t("monthEditValues")} onPress={() => setEditingMonth(true)} />
          </View>
          {repayments.map((plan) => <RepaymentPaymentSection key={plan.id} plan={plan} month={budget.month} paid={paidRepayments.has(plan.id)} onToggle={() => { void handleRepaymentToggle(plan.id); }} />)}
          <CustomExpensesHeader expenses={expenses} onAdd={handleAddExpense}
            onCopyPrevious={hasPreviousBudget ? handleCopyPrevious : undefined}
            previousMonthLabel={expenses.length === 0 ? previousMonthLabel : undefined} />
        </View>
      }
      ListFooterComponent={
        <View className="gap-3">
          <View className="h-3 rounded-b-2xl border border-t-0 border-border bg-card" />
          <MonthlySummarySection budget={budget} expenses={expenses} loans={loans}
            repayments={repayments} paidRepayments={paidRepayments} savingsGoal={savingsGoal} />
        </View>
      }
    />
    {editingMonth ? <BudgetMonthEditor initialMonth={month} budget={budget} onClose={() => setEditingMonth(false)}
      onSave={async (_month, income, goal) => {
        await flushAllExpenseUpdates();
        if (!budget.id) await createBudgetMonth(month, { income, savingsGoal: goal });
        else await saveMonthPreferences(month, income, goal);
        setEditingMonth(false);
        void haptics.success();
        try { await loadData(month); }
        catch { setLoadError(t("errorLoadingData")); }
      }} /> : null}
    <ConfirmDialog visible={expenseToDelete !== null} destructive title={t("expenseDeleteTitle")}
      message={t("expenseDeleteBody", { name: expenseToDelete?.category || t("category"), amount: formatCurrency(expenseToDelete?.amount ?? 0) })}
      confirmLabel={t("delete")} onClose={() => setExpenseToDelete(null)}
      onConfirm={async () => { if (expenseToDelete) await handleRemoveExpense(expenseToDelete.id); }} /></>
  );
}
