import { Text } from "../../src/components/ui/Typography";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, ScrollView, Keyboard, Pressable, FlatList, type ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { monthLabel } from "../../src/lib/monthLabel";
import {
  loadLoans,
  computeMonthSummary,
  loadBudget,
  createBudgetMonth,
  loadSavingsGoal,
  saveMonthPreferences,
  listExpenses,
  saveExpenseDraft,
  type ExpenseDraft,
  updateExpense,
  setExpenseRecurring,
  removeExpenseWithUndo,
  restoreDeletedExpense,
  copyBudgetFromMonth,
  currentMonth,
  addMonths,
  type Loans,
  type Budget,
  type Expense,
} from "../../src/lib/budget";
import { listRepaymentPlans, paidRepaymentIds, repaymentForMonth, setRepaymentPaid, type RepaymentPlan } from "../../src/lib/repaymentPlans";
import { RepaymentPaymentSection } from "../../src/components/RepaymentPaymentSection";
import { CustomExpensesHeader, CustomExpenseRow } from "../../src/components/CustomExpensesSection";
import { MonthlySummarySection } from "../../src/components/MonthlySummarySection";
import { ExpenseEditor } from "../../src/components/ExpenseEditor";
import { BudgetMonthEditor } from "../../src/components/BudgetMonthEditor";
import { Button, IconButton } from "../../src/components/ui/Button";
import { ArrowLeft, Pencil, ChevronLeft, ChevronRight, Copy } from "../../src/components/AppIcons";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { formatCurrency } from "../../src/lib/utils";

const renderBudgetScroll = (props: ScrollViewProps) => <KeyboardAwareScrollView {...props} className="flex-1 bg-background" bottomOffset={16} />;

export default function BudgetScreen() {
  const router = useRouter();
  const [editingMonth, setEditingMonth] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const { month: monthParam, addExpense } = useLocalSearchParams<{ month?: string; addExpense?: string }>();
  const initialMonth = monthParam && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : currentMonth();
  const month = initialMonth;

  const [loans, setLoans] = useState<Loans | null>(null);
  const [repayments, setRepayments] = useState<RepaymentPlan[]>([]);
  const [paidRepayments, setPaidRepayments] = useState<Set<number>>(new Set());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseEditor, setExpenseEditor] = useState<{ expense?: Expense } | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const expensesRef = useRef<Expense[]>([]);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);
  const [hasPreviousBudget, setHasPreviousBudget] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingsGoal, setSavingsGoal] = useState(0);

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
      toast.error("Failed to update expense.");
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
  const previousMonthLabel = monthLabel(previousMonth, "short");


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
    const exps = b ? await listExpenses(b.id) : [];
    if (request !== loadRequestRef.current) return;
    setLoans(l);
    setRepayments(plans);
    setPaidRepayments(paidPlans);
    setHasPreviousBudget(!!pb);
    setSavingsGoal(b?.savings_goal ?? sg.goal_amount);
    budgetIdRef.current = b ? b.id : null;
    setExpenses(exps);
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
        if (!cancelled) setLoadError("Failed to load data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ++loadRequestRef.current;
    };
  }, [month, loadData, flushAllExpenseUpdates]));

  const ensureBudget = useCallback(async (): Promise<Budget> => {
    // `id === 0` is the unsaved placeholder created by loadData for a month
    // with no row yet; it must be persisted before expenses can reference it.
    if (budget && budget.id !== 0) return budget;
    const { budget: b } = await createBudgetMonth(month);
    // Creating a month also populates recurring expenses. Include those rows
    // before appending the expense being saved from this previously empty month.
    const seededExpenses = await listExpenses(b.id);
    setExpenses(seededExpenses);
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
      toast.success(nextPaid ? "Marked paid" : "Marked unpaid");
    } catch {
      toast.error("Failed to update loan.");
    } finally {
      toggleInFlightRef.current = false;
    }
  }, [paidRepayments, ensureBudget, month]);

  const handleSaveExpense = async (fields: ExpenseDraft, id?: number, keepOpen = false) => {
    await flushAllExpenseUpdates();
    const savedBudget = await ensureBudget();
    const saved = await saveExpenseDraft(savedBudget.id, fields, id);
    setExpenses(current => id === undefined ? [...current, saved] : current.map(expense => expense.id === id ? saved : expense));
    if (!keepOpen) setExpenseEditor(null);
    toast.success(id === undefined ? "Expense added" : "Expense updated");

  };

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
          toast.success(fields.paid ? "Marked paid" : "Marked unpaid");
        } catch {
          if (prevExpense) {
            setExpenses((prev) =>
              prev.map((e) =>
                e.id === id ? { ...e, paid: prevExpense.paid } : e
              )
            );
          }
          toast.error("Failed to update expense.");
        }
      }
    },
    [scheduleExpenseUpdate]
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
        toast.success(next ? "Repeats monthly" : "Monthly repeat removed");
      } catch {
        if (prevExpense) {
          setExpenses((prev) =>
            prev.map((e) => (e.id === expense.id ? prevExpense : e))
          );
        }
        toast.error("Failed to update expense.");
      }
    },
    [flushAllExpenseUpdates]
  );

  const handleRemoveExpense = useCallback(
    async (id: number) => {
      try {
        await flushAllExpenseUpdates();
        const deleted = await removeExpenseWithUndo(id);
        let restored = false;
        let restoring = false;
        toast("Expense deleted", { duration: 10000, action: { label: "Undo", onClick: () => {
          if (restored || restoring) return;
          restoring = true;
          void restoreDeletedExpense(deleted).then(expense => {
            restored = true;
            if (budgetIdRef.current === expense.budget_id) setExpenses(current => [...current.filter(item => item.id !== expense.id), expense].sort((a, b) => a.id - b.id));
            toast.success("Expense restored");
          }).catch(() => toast.error("Could not restore expense. Try again.")).finally(() => { restoring = false; });
        } } });
        cancelExpenseUpdate(id);
        setExpenses((curr) => curr.filter((e) => e.id !== id));
        setExpenseToDelete(null);
        setExpenseEditor(current => current?.expense?.id === id ? null : current);

      } catch {
        toast.error("Failed to remove expense.");
      }
    },
    [cancelExpenseUpdate, flushAllExpenseUpdates]
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

      toast.success(
        `Copied data from ${previousMonthLabel}`
      );
    } catch {
      toast.error("No previous budget found");
    }
  }, [month, previousMonth, previousMonthLabel, loading, flushAllExpenseUpdates]);

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

  useFocusEffect(useCallback(() => {
    if (addExpense === "1" && !loading && !loadError) {
      setExpenseEditor({});
      router.setParams({ addExpense: undefined });
    }
  }, [addExpense, loading, loadError, router]));

  // Keep checkboxes in place while marking several payments. Sorting by paid
  // state moves a different record into the position the user just tapped.
  const activePayments = useMemo(() => repayments.filter(plan => repaymentForMonth(plan, month) > 0), [repayments, month]);
  const editExpense = useCallback((expense: Expense) => setExpenseEditor({ expense }), []);
  const paymentCount = expenses.length + activePayments.length;
  const paidCount = expenses.filter(expense => expense.paid).length + activePayments.filter(plan => paidRepayments.has(plan.id)).length;

  if (loadError || loading || !loans || !budget || !monthSummary) {
    if (loadError) {
      return (
        <ScrollView className="flex-1 bg-background" keyboardDismissMode="on-drag" onTouchStart={() => Keyboard.dismiss()}>
          <View className="w-full max-w-md self-center items-center gap-4 p-4 pb-6 pt-20">
            <Text className="text-center text-sm text-destructive">{loadError}</Text>
            <Pressable
              onPress={() => {
                setLoadError(null);
                setLoading(true);
                void (async () => {
                  try {
                    await loadData(month);
                  } catch {
                    setLoadError("Failed to load data.");
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              className="rounded-lg bg-primary px-4 py-2"
            >
              <Text className="text-sm font-medium text-primary-foreground">Retry</Text>
            </Pressable>
          </View>
        </ScrollView>
      );
    }
    return (
      <ScrollView className="flex-1 bg-background" keyboardDismissMode="on-drag" onTouchStart={() => Keyboard.dismiss()}>
        <View className="w-full max-w-md self-center gap-4 px-5 pt-4 pb-6">
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
      contentContainerClassName="w-full max-w-md self-center px-5 pt-4 pb-6"
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
        <View className="border-x border-border bg-surface px-2">
          <CustomExpenseRow expense={item} isLast={index === expenses.length - 1} onUpdate={handleUpdateExpense} onRemove={askRemoveExpense} onToggleRecurring={handleToggleRecurring} onEdit={editExpense} />
        </View>
      )}
      ListHeaderComponent={
        <View className="gap-4">
          <View className="flex-row items-center">
            <IconButton icon={ArrowLeft} accessibilityLabel="Back to months" onPress={() => router.replace("/(budget)")} />
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-semibold text-foreground">{monthLabel(month)}</Text>
            <IconButton icon={ChevronLeft} accessibilityLabel="Previous month" onPress={() => router.setParams({ month: previousMonth })} />
            <IconButton icon={ChevronRight} accessibilityLabel="Next month" onPress={() => router.setParams({ month: addMonths(month, 1) })} />
          </View>
          <View className="gap-3 rounded-[28px] border border-border bg-surface-container p-5">
            <View className="flex-row items-center">
              <View className="min-w-0 flex-1">
                <Text className="text-label-medium text-muted-foreground">Current remaining</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontVariant: ["tabular-nums"] }}
                  className={`text-[34px] font-semibold ${monthSummary.actualRemaining < 0 ? "text-destructive" : "text-foreground"}`}>
                  {formatCurrency(monthSummary.actualRemaining)}
                </Text>
              </View>
              <IconButton icon={Pencil} accessibilityLabel="Edit income and savings target" onPress={() => setEditingMonth(true)} />
            </View>
            {paymentCount > 0 && <View className="gap-1.5">
              <Text className="text-label-medium text-muted-foreground">{`${paidCount} of ${paymentCount} paid`}</Text>
              <View className="h-1.5 overflow-hidden rounded-full bg-secondary-container" accessible accessibilityRole="progressbar" accessibilityLabel="Payments made"
                accessibilityValue={{ min: 0, max: paymentCount, now: paidCount }}>
                <View className="h-full rounded-full bg-primary" style={{ width: `${paidCount / paymentCount * 100}%` }} />
              </View>
            </View>}
          </View>
          <CustomExpensesHeader expenses={expenses} onAdd={() => { setExpenseEditor({}); }} />
        </View>
      }
      ListFooterComponent={
        <View className="gap-4">
          <View className="rounded-b-[24px] border-x border-b border-border bg-surface px-2 pb-1">
            {hasPreviousBudget && <Button className="self-start" variant="text" icon={Copy} label="Copy from previous month" onPress={() => setConfirmCopy(true)} />}
          </View>
          {activePayments.length > 0 && <View className="gap-2.5">
            <Text accessibilityRole="header" className="text-base font-semibold text-foreground">{"Loan & card payments"}</Text>
            <View className="rounded-[24px] border border-border bg-surface px-4">
              {activePayments.map((plan, index) => <RepaymentPaymentSection key={plan.id} plan={plan} month={budget.month} paid={paidRepayments.has(plan.id)} last={index === activePayments.length - 1} onToggle={() => { void handleRepaymentToggle(plan.id); }} />)}
            </View>
          </View>}
          <MonthlySummarySection budget={budget} expenses={expenses} loans={loans}
            repayments={repayments} paidRepayments={paidRepayments} summary={monthSummary} />
        </View>
      }
    />
    {editingMonth ? <BudgetMonthEditor initialMonth={month} budget={budget} onClose={() => setEditingMonth(false)}
      onSave={async (_month, income, goal) => {
        await flushAllExpenseUpdates();
        if (!budget.id) await createBudgetMonth(month, { income, savingsGoal: goal });
        else await saveMonthPreferences(month, income, goal);
        setEditingMonth(false);
        toast.success("Budget saved");

        try { await loadData(month); }
        catch { setLoadError("Failed to load data."); }
      }} /> : null}
    {expenseEditor && <ExpenseEditor expense={expenseEditor.expense} onSave={handleSaveExpense} onClose={() => setExpenseEditor(null)} onDelete={expenseEditor.expense ? () => askRemoveExpense(expenseEditor.expense!.id) : undefined} />}
    <ConfirmDialog visible={confirmCopy} title="Copy from previous month" message={`Copy missing expenses from ${previousMonthLabel}? Your existing expenses are kept, and copied expenses start unpaid.`} onClose={() => setConfirmCopy(false)} onConfirm={async () => { await handleCopyPrevious(); setConfirmCopy(false); }} />
    <ConfirmDialog visible={expenseToDelete !== null} destructive title="Delete expense?"
      message={`Delete “${expenseToDelete?.category || "Category"}” (${formatCurrency(expenseToDelete?.amount ?? 0)}) from this month's budget?`}
      confirmLabel="Delete" onClose={() => setExpenseToDelete(null)}
      onConfirm={async () => { if (expenseToDelete) await handleRemoveExpense(expenseToDelete.id); }} /></>
  );
}
