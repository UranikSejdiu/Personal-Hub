import * as db from "./db";
import { withTransaction } from "./db";
import { pmt } from "./calculations";
import {
  type Loans,
  type Budget,
  type Expense,
  type SavingsGoal,
  type RecurringExpense,
  type MonthSummary,
  EMPTY_LOANS,
} from "../types/budget";

export { EMPTY_LOANS };
export type { Loans, Budget, Expense, SavingsGoal, RecurringExpense, MonthSummary };

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Loans (single global profile)
// ---------------------------------------------------------------------------

export async function loadLoans(): Promise<Loans> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM loans WHERE id = 1"
  );
  if (!row) return { ...EMPTY_LOANS };
  return {
    loan_amount: Number(row.loan_amount) || 0,
    loan_rate: Number(row.loan_rate) || 0,
    loan_term: Number(row.loan_term) || 0,
    loan_payment: Number(row.loan_payment) || 0,
    loan_start_date: (row.loan_start_date as string | null) ?? null,
    loan_payment_day: Number(row.loan_payment_day) || 1,
    loan_months_paid: Number(row.loan_months_paid) || 0,
    cc_balance: Number(row.cc_balance) || 0,
    cc_apr: Number(row.cc_apr) || 0,
    cc_payment: Number(row.cc_payment) || 0,
    cc_months_paid: Number(row.cc_months_paid) || 0,
  };
}

export async function saveLoans(loans: Loans): Promise<void> {
  await db.execute(
    `INSERT INTO loans (
      id, loan_amount, loan_rate, loan_term, loan_payment,
      loan_start_date, loan_payment_day, loan_months_paid,
      cc_balance, cc_apr, cc_payment, cc_months_paid
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      loan_amount = excluded.loan_amount,
      loan_rate = excluded.loan_rate,
      loan_term = excluded.loan_term,
      loan_payment = excluded.loan_payment,
      loan_start_date = excluded.loan_start_date,
      loan_payment_day = excluded.loan_payment_day,
      loan_months_paid = excluded.loan_months_paid,
      cc_balance = excluded.cc_balance,
      cc_apr = excluded.cc_apr,
      cc_payment = excluded.cc_payment,
      cc_months_paid = excluded.cc_months_paid,
      updated_at = datetime('now')`,
    [
      loans.loan_amount,
      loans.loan_rate,
      loans.loan_term,
      loans.loan_payment,
      loans.loan_start_date ?? null,
      loans.loan_payment_day,
      loans.loan_months_paid,
      loans.cc_balance,
      loans.cc_apr,
      loans.cc_payment,
      loans.cc_months_paid,
    ]
  );
}

export async function incrementLoanMonthsPaid(delta: number): Promise<Loans> {
  const loans = await loadLoans();
  const newMonthsPaid = Math.max(
    0,
    Math.min(loans.loan_term, loans.loan_months_paid + delta)
  );
  const updated = { ...loans, loan_months_paid: newMonthsPaid };
  await saveLoans(updated);
  return updated;
}

export async function incrementCcMonthsPaid(delta: number): Promise<Loans> {
  const loans = await loadLoans();
  const newMonthsPaid = Math.max(0, loans.cc_months_paid + delta);
  const updated = { ...loans, cc_months_paid: newMonthsPaid };
  await saveLoans(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Savings goal (single global profile)
// ---------------------------------------------------------------------------

export async function loadSavingsGoal(): Promise<SavingsGoal> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM savings_goals WHERE id = 1"
  );
  if (!row) return { goal_amount: 0, salary: 0 };
  return {
    goal_amount: Number(row.goal_amount) || 0,
    salary: Number(row.salary) || 0,
  };
}

export async function saveSavingsGoal(
  goalAmount: number,
  salary: number
): Promise<void> {
  await db.execute(
    `INSERT INTO savings_goals (id, goal_amount, salary)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       goal_amount = excluded.goal_amount,
       salary = excluded.salary,
       updated_at = datetime('now')`,
    [goalAmount, salary]
  );
}

// ---------------------------------------------------------------------------
// Recurring expenses (templates)
// ---------------------------------------------------------------------------

export async function listRecurringExpenses(): Promise<RecurringExpense[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM recurring_expenses ORDER BY id"
  );
  return rows.map((row) => ({
    id: Number(row.id),
    category: String(row.category),
    amount: Number(row.amount) || 0,
  }));
}

export async function addRecurringExpense(
  category: string,
  amount: number
): Promise<RecurringExpense> {
  const result = await db.execute(
    "INSERT INTO recurring_expenses (category, amount) VALUES (?, ?)",
    [category, amount]
  );
  if (!result.lastId) throw new Error("Failed to add recurring expense.");
  return { id: result.lastId, category, amount };
}

export async function removeRecurringExpense(id: number): Promise<void> {
  await db.execute("DELETE FROM recurring_expenses WHERE id = ?", [id]);
}

export async function populateRecurringExpenses(
  budgetId: number
): Promise<void> {
  const recurring = await listRecurringExpenses();
  if (recurring.length === 0) return;
  const existing = await db.query<Record<string, unknown>>(
    "SELECT category, amount FROM expenses WHERE budget_id = ? AND is_recurring = 1",
    [budgetId]
  );
  const existingKeys = new Set(
    existing.map((r) => `${String(r.category)}::${Number(r.amount)}`)
  );
  const toInsert = recurring.filter(
    (r) => !existingKeys.has(`${r.category}::${r.amount}`)
  );
  if (toInsert.length === 0) return;
  await withTransaction(async () => {
    for (const exp of toInsert) {
      await db.execute(
        "INSERT INTO expenses (budget_id, category, amount, is_recurring) VALUES (?, ?, ?, 1)",
        [budgetId, exp.category, exp.amount]
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Per-month budget
// ---------------------------------------------------------------------------

export async function loadBudget(month: string): Promise<Budget | null> {
  const row = await db.get<Record<string, unknown>>(
    "SELECT * FROM budgets WHERE month = ? LIMIT 1",
    [month]
  );
  if (!row) return null;
  return {
    id: Number(row.id),
    month: String(row.month),
    income: Number(row.income) || 0,
    loan_paid: Number(row.loan_paid) === 1,
    cc_paid: Number(row.cc_paid) === 1,
    updated_at: String(row.updated_at),
  };
}

export async function saveBudget(
  month: string,
  income: number,
  loanPaid: boolean,
  ccPaid: boolean
): Promise<Budget> {
  await db.execute(
    `INSERT INTO budgets (month, income, loan_paid, cc_paid)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       income = excluded.income,
       loan_paid = excluded.loan_paid,
       cc_paid = excluded.cc_paid,
       updated_at = datetime('now')`,
    [month, income, loanPaid ? 1 : 0, ccPaid ? 1 : 0]
  );
  const saved = await loadBudget(month);
  if (!saved) throw new Error("Failed to save budget.");
  return saved;
}

export async function deleteBudget(month: string): Promise<void> {
  await db.execute("DELETE FROM budgets WHERE month = ?", [month]);
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function listExpenses(budgetId: number): Promise<Expense[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT * FROM expenses WHERE budget_id = ? ORDER BY id",
    [budgetId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    budget_id: Number(row.budget_id),
    category: String(row.category),
    amount: Number(row.amount) || 0,
    paid: Number(row.paid) === 1,
    is_recurring: Number(row.is_recurring) === 1,
  }));
}

export async function addExpense(
  budgetId: number,
  category: string,
  amount: number,
  isRecurring: boolean = false
): Promise<Expense> {
  const result = await db.execute(
    "INSERT INTO expenses (budget_id, category, amount, is_recurring) VALUES (?, ?, ?, ?)",
    [budgetId, category, amount, isRecurring ? 1 : 0]
  );
  if (!result.lastId) throw new Error("Failed to add expense.");
  return {
    id: result.lastId,
    budget_id: budgetId,
    category,
    amount,
    paid: false,
    is_recurring: isRecurring,
  };
}

export async function updateExpense(
  id: number,
  fields: Partial<Pick<Expense, "category" | "amount" | "paid" | "is_recurring">>
): Promise<void> {
  const sets: string[] = [];
  const values: (number | string)[] = [];
  if (fields.category !== undefined) {
    sets.push("category = ?");
    values.push(fields.category);
  }
  if (fields.amount !== undefined) {
    sets.push("amount = ?");
    values.push(fields.amount);
  }
  if (fields.paid !== undefined) {
    sets.push("paid = ?");
    values.push(fields.paid ? 1 : 0);
  }
  if (fields.is_recurring !== undefined) {
    sets.push("is_recurring = ?");
    values.push(fields.is_recurring ? 1 : 0);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE expenses SET ${sets.join(", ")} WHERE id = ?`,
    values
  );
}

export async function removeExpense(id: number): Promise<void> {
  await db.execute("DELETE FROM expenses WHERE id = ?", [id]);
}

export async function copyBudgetFromMonth(
  sourceMonth: string,
  targetMonth: string
): Promise<{ budget: Budget; expenses: Expense[] }> {
  const sourceBudget = await loadBudget(sourceMonth);
  if (!sourceBudget) {
    const targetBudget = await saveBudget(targetMonth, 0, false, false);
    return { budget: targetBudget, expenses: [] };
  }
  const sourceExpenses = await listExpenses(sourceBudget.id);

  let targetBudget = await loadBudget(targetMonth);
  if (!targetBudget) {
    targetBudget = await saveBudget(
      targetMonth,
      sourceBudget.income,
      false,
      false
    );
  } else if (targetBudget.income === 0 && sourceBudget.income > 0) {
    targetBudget = await saveBudget(
      targetMonth,
      sourceBudget.income,
      targetBudget.loan_paid,
      targetBudget.cc_paid
    );
  }

  const targetExisting = await db.query<Record<string, unknown>>(
    "SELECT category, amount, is_recurring FROM expenses WHERE budget_id = ?",
    [targetBudget.id]
  );
  const existingKeys = new Set(
    targetExisting.map(
      (r) =>
        `${String(r.category)}::${Number(r.amount)}::${Number(r.is_recurring)}`
    )
  );
  const toCopy = sourceExpenses.filter(
    (e) =>
      !existingKeys.has(
        `${e.category}::${e.amount}::${e.is_recurring ? 1 : 0}`
      )
  );
  if (toCopy.length > 0) {
    await withTransaction(async () => {
      for (const exp of toCopy) {
        await db.execute(
          "INSERT INTO expenses (budget_id, category, amount, paid, is_recurring) VALUES (?, ?, ?, ?, ?)",
          [
            targetBudget!.id,
            exp.category,
            exp.amount,
            0,
            exp.is_recurring ? 1 : 0,
          ]
        );
      }
    });
  }

  const newExpenses = await listExpenses(targetBudget.id);
  return { budget: targetBudget, expenses: newExpenses };
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export async function listMonthSummaries(
  loans: Loans
): Promise<MonthSummary[]> {
  const savingsGoal = await loadSavingsGoal();
  const goalAmt = savingsGoal.goal_amount;

  const loanPayment =
    loans.loan_amount > 0 && loans.loan_term > 0
      ? loans.loan_payment > 0
        ? loans.loan_payment
        : pmt(loans.loan_amount, loans.loan_rate, loans.loan_term)
      : 0;

  const rows = await db.query<Record<string, unknown>>(
    `SELECT
       b.month AS month,
       b.income AS income,
       b.loan_paid AS loan_paid,
       b.cc_paid AS cc_paid,
       COALESCE(SUM(e.amount), 0) AS total_expenses,
       COALESCE(SUM(CASE WHEN e.paid = 1 THEN e.amount ELSE 0 END), 0) AS paid_expenses
     FROM budgets b
     LEFT JOIN expenses e ON e.budget_id = b.id
     GROUP BY b.id
     ORDER BY b.month DESC`
  );

  return rows.map((row) => {
    const income = Number(row.income) || 0;
    const totalExpenses = Number(row.total_expenses) || 0;
    const paidExpenses = Number(row.paid_expenses) || 0;
    const outflow =
      loanPayment + loans.cc_payment + totalExpenses + goalAmt;
    const actualOutflow =
      (Number(row.loan_paid) === 1 ? loanPayment : 0) +
      (Number(row.cc_paid) === 1 ? loans.cc_payment : 0) +
      paidExpenses;
    const actualRemaining = income - actualOutflow;
    const goalProgress =
      goalAmt > 0
        ? Math.min(100, Math.max(0, (actualRemaining / goalAmt) * 100))
        : 0;
    const goalMet = goalAmt > 0 && actualRemaining >= goalAmt;
    return {
      month: String(row.month),
      income,
      outflow,
      remaining: income - outflow,
      actualOutflow,
      actualRemaining,
      savingsGoal: goalAmt,
      goalProgress,
      goalMet,
    };
  });
}
