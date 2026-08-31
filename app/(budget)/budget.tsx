import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { toast } from "sonner-native";
import { useI18n, monthLabelShort } from "../../src/lib/i18n";
import {
  loadLoans,
  loadBudget,
  saveBudget,
  loadSavingsGoal,
  listExpenses,
  addExpense,
  updateExpense,
  removeExpense,
  copyBudgetFromMonth,
  listRecurringExpenses,
  addRecurringExpense,
  removeRecurringExpense,
  incrementLoanMonthsPaid,
  incrementCcMonthsPaid,
  currentMonth,
  addMonths,
  type Loans,
  type Budget,
  type Expense,
} from "../../src/lib/budget";
import { LoanPaymentSection } from "../../src/components/LoanPaymentSection";
import { CreditCardSection } from "../../src/components/CreditCardSection";
import { CustomExpensesSection } from "../../src/components/CustomExpensesSection";
import { MonthlySummarySection } from "../../src/components/MonthlySummarySection";

export default function BudgetScreen() {
  const { month: monthParam } = useLocalSearchParams<{ month?: string }>();
  const initialMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth();
  const { t, lang } = useI18n();
  const [month] = useState<string>(initialMonth);
  const [loans, setLoans] = useState<Loans | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [hasPreviousBudget, setHasPreviousBudget] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingsGoal, setSavingsGoal] = useState(0);

  const tRef = useRef(t);
  const budgetIdRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedRef = useRef("");

  const previousMonth = addMonths(month, -1);
  const previousMonthLabel = monthLabelShort(lang, previousMonth);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const loadData = useCallback(async (m: string) => {
    const [l, b, pb, sg] = await Promise.all([
      loadLoans(),
      loadBudget(m),
      loadBudget(addMonths(m, -1)),
      loadSavingsGoal(),
    ]);
    setLoans(l);
    setHasPreviousBudget(!!pb);
    setSavingsGoal(sg.goal_amount);
    budgetIdRef.current = b ? b.id : null;
    if (b) {
      const exps = await listExpenses(b.id);
      setExpenses(exps);
    } else {
      setExpenses([]);
    }
    setBudget(
      b ?? {
        id: 0,
        month: m,
        income: 0,
        loan_paid: false,
        cc_paid: false,
        updated_at: "",
      }
    );
    persistedRef.current = JSON.stringify([
      b ? b.income : 0,
      b ? b.loan_paid : false,
      b ? b.cc_paid : false,
    ]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        await loadData(month);
        if (cancelled) return;
        setBudget((b) => b);
      } catch {
        if (!cancelled) toast.error(t("errorLoadingData"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, loadData, t]);

  const pendingSaveRef = useRef<{
    month: string;
    income: number;
    loanPaid: boolean;
    ccPaid: boolean;
    current: string;
  } | null>(null);

  const flushSave = useCallback(async () => {
    const pending = pendingSaveRef.current;
    if (!pending || pending.current === persistedRef.current) {
      setIsSaving(false);
      return;
    }
    try {
      const saved = await saveBudget(
        pending.month,
        pending.income,
        pending.loanPaid,
        pending.ccPaid
      );
      budgetIdRef.current = saved.id;
      persistedRef.current = pending.current;
      pendingSaveRef.current = null;
      setSaveError(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : tRef.current("saveFailed")
      );
    } finally {
      setIsSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsSaving(true);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushSave();
    }, 1000);
  }, [flushSave]);

  useEffect(() => {
    if (!budget || !loans) return;
    const current = JSON.stringify([
      budget.income,
      budget.loan_paid,
      budget.cc_paid,
    ]);
    if (current === persistedRef.current) return;
    pendingSaveRef.current = {
      month,
      income: budget.income,
      loanPaid: budget.loan_paid,
      ccPaid: budget.cc_paid,
      current,
    };
    scheduleSave();
  }, [budget, loans, month, scheduleSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void flushSave();
    };
  }, [flushSave]);

  const ensureBudget = useCallback(async (): Promise<Budget> => {
    if (budget) return budget;
    const b = await saveBudget(month, 0, false, false);
    setBudget(b);
    persistedRef.current = JSON.stringify([0, false, false]);
    budgetIdRef.current = b.id;
    return b;
  }, [month, budget]);

  const handleIncomeChange = useCallback(
    async (v: number) => {
      await ensureBudget();
      setBudget((prev) => (prev ? { ...prev, income: v } : prev));
      scheduleSave();
    },
    [ensureBudget, scheduleSave]
  );

  const handleLoanToggle = useCallback(async () => {
    const prev = budget;
    if (!prev) return;
    const newLoanPaid = !prev.loan_paid;
    const delta = newLoanPaid ? 1 : -1;
    try {
      await ensureBudget();
      const updatedLoans = await incrementLoanMonthsPaid(delta);
      setLoans(updatedLoans);
      setBudget((b) => (b ? { ...b, loan_paid: newLoanPaid } : b));
      scheduleSave();
    } catch {
      toast.error(t("errorUpdatingLoan"));
    }
  }, [budget, ensureBudget, scheduleSave, t]);

  const handleCcToggle = useCallback(async () => {
    const prev = budget;
    if (!prev) return;
    const newCcPaid = !prev.cc_paid;
    const delta = newCcPaid ? 1 : -1;
    try {
      await ensureBudget();
      const updatedLoans = await incrementCcMonthsPaid(delta);
      setLoans(updatedLoans);
      setBudget((b) => (b ? { ...b, cc_paid: newCcPaid } : b));
      scheduleSave();
    } catch {
      toast.error(t("errorUpdatingCc"));
    }
  }, [budget, ensureBudget, scheduleSave, t]);

  const handleAddExpense = useCallback(async () => {
    const b = await ensureBudget();
    await addExpense(b.id, "", 0, false);
    const exps = await listExpenses(b.id);
    setExpenses(exps);
  }, [ensureBudget]);

  const handleUpdateExpense = useCallback(
    async (id: number, fields: Partial<Pick<Expense, "category" | "amount" | "paid">>) => {
      const prevExpense = expenses.find((e) => e.id === id);
      setExpenses((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...fields } : e))
      );
      try {
        await updateExpense(id, fields);
      } catch {
        if (prevExpense) {
          setExpenses((prev) =>
            prev.map((e) => (e.id === id ? prevExpense : e))
          );
        }
        toast.error(t("errorUpdatingExpense"));
      }
    },
    [expenses, t]
  );

  const handleToggleRecurring = useCallback(
    async (expense: Expense, next: boolean) => {
      const prevExpense = expenses.find((e) => e.id === expense.id);
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expense.id ? { ...e, is_recurring: next } : e
        )
      );
      try {
        await updateExpense(expense.id, { is_recurring: next });
        if (next) {
          await addRecurringExpense(expense.category, expense.amount);
        } else {
          const templates = await listRecurringExpenses();
          const match = templates.find(
            (x) => x.category === expense.category && x.amount === expense.amount
          );
          if (match) await removeRecurringExpense(match.id);
        }
      } catch {
        if (prevExpense) {
          setExpenses((prev) =>
            prev.map((e) => (e.id === expense.id ? prevExpense : e))
          );
        }
        toast.error(t("errorUpdatingExpense"));
      }
    },
    [expenses, t]
  );

  const handleRemoveExpense = useCallback(async (id: number) => {
    const exp = expenses.find((e) => e.id === id);
    try {
      if (exp?.is_recurring) {
        const templates = await listRecurringExpenses();
        const match = templates.find(
          (x) => x.category === exp.category && x.amount === exp.amount
        );
        if (match) await removeRecurringExpense(match.id);
      }
      await removeExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch {
      toast.error(t("errorRemovingExpense"));
    }
  }, [expenses, t]);

  const handleCopyPrevious = useCallback(async () => {
    if (loading) return;
    try {
      const result = await copyBudgetFromMonth(previousMonth, month);
      setBudget(result.budget);
      budgetIdRef.current = result.budget.id;
      setExpenses(result.expenses);
      persistedRef.current = JSON.stringify([
        result.budget.income,
        result.budget.loan_paid,
        result.budget.cc_paid,
      ]);
      toast.success(
        t("copiedFromPreviousMonth", { month: previousMonthLabel })
      );
    } catch {
      toast.error(t("noPreviousMonthFound"));
    }
  }, [month, previousMonth, previousMonthLabel, loading, t]);

  const prevMonthLabel = monthLabelShort(lang, addMonths(month, -1));

  if (loading || !loans || !budget) {
    return (
      <ScrollView className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
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
              <View className="grid grid-cols-1 gap-4">
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
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-md self-center gap-4 p-4 pb-28">
        {saveError ? (
          <View className="rounded-md bg-red-500/15 p-3">
            <Text className="text-sm font-medium text-red-500">{saveError}</Text>
          </View>
        ) : null}
        {isSaving ? (
          <Text className="text-right text-xs text-muted-foreground">
            {t("savingAuto")}
          </Text>
        ) : null}
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">{t("tabBudget")}</Text>
        </View>

        {budget && (
          <>
            <LoanPaymentSection
              budget={budget}
              loans={loans}
              onToggle={handleLoanToggle}
            />

            <CreditCardSection
              budget={budget}
              loans={loans}
              onToggle={handleCcToggle}
            />
          </>
        )}

        <CustomExpensesSection
          expenses={expenses}
          onAdd={handleAddExpense}
          onUpdate={handleUpdateExpense}
          onRemove={handleRemoveExpense}
          onToggleRecurring={handleToggleRecurring}
          onCopyPrevious={hasPreviousBudget ? handleCopyPrevious : undefined}
          previousMonthLabel={expenses.length === 0 ? prevMonthLabel : undefined}
        />

        {budget && (
          <MonthlySummarySection
            budget={budget}
            expenses={expenses}
            loans={loans}
            savingsGoal={savingsGoal}
            onIncomeChange={handleIncomeChange}
          />
        )}
      </View>
    </ScrollView>
  );
}
