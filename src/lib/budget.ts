import * as db from "./db";
import { creditCardDetails, creditCardFields, creditCardPaymentForMonth, creditCardScheduledMonths, isCreditCardActive, isCreditCardMonth, isCreditCardScheduleValid, isCreditCardValid, type CreditCardSlot } from "./creditCards";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS, pmt } from "./calculations";
import { allPaidRepayments, clearRepaymentsForMonth, listRepaymentPlans, repaymentForMonth, type RepaymentPlan } from "./repaymentPlans";
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
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  const year = match ? Number(match[1]) : NaN;
  const month = match ? Number(match[2]) : NaN;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    // Malformed key: never emit "NaN-NaN" — fall back to the current month.
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Loans (single global profile)
// ---------------------------------------------------------------------------

export async function loadLoans(
  exec: db.DbExecutor = db.defaultExecutor
): Promise<Loans> {
  const row = await exec.get<Record<string, unknown>>(
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
    loan_name: String(row.loan_name) || "",
    loan_schedule_mode: row.loan_schedule_mode === "count" || row.loan_schedule_mode === "dates" ? row.loan_schedule_mode : null,
    loan_start_month: typeof row.loan_start_month === "string" ? row.loan_start_month : null,
    loan_end_month: typeof row.loan_end_month === "string" ? row.loan_end_month : null,
    cc_balance: Number(row.cc_balance) || 0,
    cc_apr: Number(row.cc_apr) || 0,
    cc_payment: Number(row.cc_payment) || 0,
    cc_months_paid: Number(row.cc_months_paid) || 0,
    cc_name: String(row.cc_name) || "",
    cc_start_month: typeof row.cc_start_month === "string" ? row.cc_start_month : null,
    cc_end_month: typeof row.cc_end_month === "string" ? row.cc_end_month : null,
    cc_plan_mode: row.cc_plan_mode === "installment" ? "installment" : null,
    cc_installments: Number(row.cc_installments) || 0,
    cc2_balance: Number(row.cc2_balance) || 0,
    cc2_apr: Number(row.cc2_apr) || 0,
    cc2_payment: Number(row.cc2_payment) || 0,
    cc2_months_paid: Number(row.cc2_months_paid) || 0,
    cc2_name: String(row.cc2_name ?? ""),
    cc2_start_month: typeof row.cc2_start_month === "string" ? row.cc2_start_month : null,
    cc2_end_month: typeof row.cc2_end_month === "string" ? row.cc2_end_month : null,
    cc2_plan_mode: row.cc2_plan_mode === "installment" ? "installment" : null,
    cc2_installments: Number(row.cc2_installments) || 0,
  };
}

export async function saveLoans(
  loans: Loans,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<void> {
  if (!isCreditCardValid(creditCardDetails(loans, 1)) || !isCreditCardValid(creditCardDetails(loans, 2))) {
    throw new Error("Credit card values or payment schedule are invalid");
  }
  if (!isCreditCardScheduleValid({ startMonth: loans.loan_start_month, endMonth: loans.loan_end_month }) ||
      (loans.loan_schedule_mode !== null && loans.loan_schedule_mode !== "count" && loans.loan_schedule_mode !== "dates") ||
      (loans.loan_schedule_mode !== null && (!loans.loan_start_month || !loans.loan_end_month || loans.loan_term <= 0 || loans.loan_months_paid > loans.loan_term)) ||
      (loans.loan_schedule_mode === "dates" && creditCardScheduledMonths({ startMonth: loans.loan_start_month, endMonth: loans.loan_end_month }) !== loans.loan_term)) {
    throw new Error("Loan payment schedule is invalid");
  }
  if (!Number.isSafeInteger(loans.loan_term) || loans.loan_term < 0 ||
      loans.loan_term > MAX_LOAN_TERM_MONTHS || !Number.isFinite(loans.loan_rate) ||
      loans.loan_rate < 0 || loans.loan_rate > MAX_LOAN_ANNUAL_RATE ||
      !Number.isFinite(loans.loan_amount) || loans.loan_amount < 0 ||
      loans.loan_amount > MAX_LOAN_AMOUNT || !Number.isFinite(loans.loan_payment) ||
      loans.loan_payment < 0 || loans.loan_payment > MAX_LOAN_AMOUNT ||
      !Number.isSafeInteger(loans.loan_months_paid) || loans.loan_months_paid < 0 ||
      loans.loan_months_paid > MAX_LOAN_TERM_MONTHS ||
      !Number.isSafeInteger(loans.cc_months_paid) || loans.cc_months_paid < 0 ||
      loans.cc_months_paid > MAX_LOAN_TERM_MONTHS ||
      !Number.isSafeInteger(loans.loan_payment_day) ||
      loans.loan_payment_day < 1 || loans.loan_payment_day > 31) {
    throw new Error("Loan values are out of range");
  }
  await exec.execute(
    `INSERT INTO loans (
      id, loan_amount, loan_rate, loan_term, loan_payment,
      loan_start_date, loan_payment_day, loan_months_paid, loan_name,
      loan_schedule_mode, loan_start_month, loan_end_month,
      cc_balance, cc_apr, cc_payment, cc_months_paid, cc_name,
      cc_start_month, cc_end_month, cc2_balance, cc2_apr, cc2_payment,
      cc2_months_paid, cc2_name, cc2_start_month, cc2_end_month,
      cc_plan_mode, cc_installments, cc2_plan_mode, cc2_installments
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      loan_amount = excluded.loan_amount,
      loan_rate = excluded.loan_rate,
      loan_term = excluded.loan_term,
      loan_payment = excluded.loan_payment,
      loan_start_date = excluded.loan_start_date,
      loan_payment_day = excluded.loan_payment_day,
      loan_months_paid = excluded.loan_months_paid,
      loan_name = excluded.loan_name,
      loan_schedule_mode = excluded.loan_schedule_mode,
      loan_start_month = excluded.loan_start_month,
      loan_end_month = excluded.loan_end_month,
      cc_balance = excluded.cc_balance,
      cc_apr = excluded.cc_apr,
      cc_payment = excluded.cc_payment,
      cc_months_paid = excluded.cc_months_paid,
      cc_name = excluded.cc_name,
      cc_start_month = excluded.cc_start_month,
      cc_end_month = excluded.cc_end_month,
      cc2_balance = excluded.cc2_balance,
      cc2_apr = excluded.cc2_apr,
      cc2_payment = excluded.cc2_payment,
      cc2_months_paid = excluded.cc2_months_paid,
      cc2_name = excluded.cc2_name,
      cc2_start_month = excluded.cc2_start_month,
      cc2_end_month = excluded.cc2_end_month,
      cc_plan_mode = excluded.cc_plan_mode,
      cc_installments = excluded.cc_installments,
      cc2_plan_mode = excluded.cc2_plan_mode,
      cc2_installments = excluded.cc2_installments,
      updated_at = datetime('now')`,
    [
      loans.loan_amount,
      loans.loan_rate,
      loans.loan_term,
      loans.loan_payment,
      loans.loan_start_date ?? null,
      loans.loan_payment_day,
      loans.loan_months_paid,
      loans.loan_name,
      loans.loan_schedule_mode,
      loans.loan_start_month,
      loans.loan_end_month,
      loans.cc_balance,
      loans.cc_apr,
      loans.cc_payment,
      loans.cc_months_paid,
      loans.cc_name,
      loans.cc_start_month,
      loans.cc_end_month,
      loans.cc2_balance,
      loans.cc2_apr,
      loans.cc2_payment,
      loans.cc2_months_paid,
      loans.cc2_name,
      loans.cc2_start_month,
      loans.cc2_end_month,
      loans.cc_plan_mode,
      loans.cc_installments,
      loans.cc2_plan_mode,
      loans.cc2_installments,
    ]
  );
}

/** Update a single name without committing any other unsaved form fields. */
export async function saveDebtName(slot: "loan" | CreditCardSlot, name: string): Promise<void> {
  const cleanName = name.trim();
  if (cleanName.length > 100) throw new Error("Name is too long");
  const column = slot === "loan" ? "loan_name" : slot === 1 ? "cc_name" : "cc2_name";
  await db.execute(
    `INSERT INTO loans (id, ${column}) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}, updated_at = datetime('now')`,
    [cleanName]
  );
}

/**
 * Flip this month's "loan payment" flag and the matching months counter in a
 * single transaction so the pair can never drift apart if the app is
 * backgrounded between the two writes.
 *
 * Track whether this flag actually incremented the counter. A payment checked
 * after the loan reached its term must not decrement the counter on undo.
 */
export async function applyLoanPaidToggle(
  month: string,
  newLoanPaid: boolean
): Promise<{ loans: Loans; budget: Budget }> {
  return db.withTransaction(async (tx) => {
    const loans = await loadLoans(tx);
    const budget = await loadBudget(month, tx);
    if (!budget) throw new Error("Budget not found for month.");
    if (budget.loan_paid === newLoanPaid) return { loans, budget };
    if (newLoanPaid && loanPaymentForMonth(loans, month) <= 0) {
      throw new Error("No loan payment scheduled for this month");
    }
    const counterRow = await tx.get<{ loan_counter_incremented: number | null }>(
      "SELECT loan_counter_incremented FROM budgets WHERE id = ?", [budget.id]
    );
    const term = loans.loan_term;
    let monthsPaid = loans.loan_months_paid;
    let counted = 0;
    if (newLoanPaid) {
      if (term <= 0 || monthsPaid < term) {
        monthsPaid += 1;
        counted = 1;
      }
    } else {
      let contributed = counterRow?.loan_counter_incremented === 1;
      if (counterRow?.loan_counter_incremented === null) {
        // Old rows have no ledger. Decrement only when every currently checked
        // month is represented in the counter; otherwise ownership is unclear.
        const checked = await tx.get<{ count: number }>(
          "SELECT COUNT(*) AS count FROM budgets WHERE loan_paid = 1"
        );
        contributed = checked?.count === monthsPaid;
      }
      if (contributed) monthsPaid = Math.max(0, monthsPaid - 1);
    }
    const updatedLoans = { ...loans, loan_months_paid: monthsPaid };
    await saveLoans(updatedLoans, tx);
    await saveBudget(month, budget.income, newLoanPaid, budget.cc_paid, tx);
    await tx.execute("UPDATE budgets SET loan_counter_incremented = ? WHERE id = ?", [counted, budget.id]);
    return { loans: updatedLoans, budget };
  });
}

/** Same as {@link applyLoanPaidToggle} for the credit-card payment flag. */
export async function applyCcPaidToggle(
  month: string,
  newCcPaid: boolean,
  slot: CreditCardSlot = 1
): Promise<{ loans: Loans; budget: Budget }> {
  return db.withTransaction(async (tx) => {
    const loans = await loadLoans(tx);
    const budget = await loadBudget(month, tx);
    if (!budget) throw new Error("Budget not found for month.");
    const paidKey = slot === 1 ? "cc_paid" : "cc2_paid";
    if (budget[paidKey] === newCcPaid) return { loans, budget };
    const card = creditCardDetails(loans, slot);
    if (newCcPaid && (!isCreditCardActive(card, month) || creditCardPaymentForMonth(card, month) <= 0)) {
      throw new Error("No credit card payment scheduled for this month");
    }
    const monthsPaid = Math.max(0, card.monthsPaid + (newCcPaid ? 1 : -1));
    const updatedLoans = { ...loans, ...creditCardFields(slot, { ...card, monthsPaid }) };
    await saveLoans(updatedLoans, tx);

    await tx.execute(`UPDATE budgets SET ${paidKey} = ?, updated_at = datetime('now') WHERE id = ?`, [newCcPaid ? 1 : 0, budget.id]);
    return { loans: updatedLoans, budget: { ...budget, [paidKey]: newCcPaid } };
  });
}

// ---------------------------------------------------------------------------
// Savings goal (single global profile)
// ---------------------------------------------------------------------------

export async function loadSavingsGoal(
  exec: db.DbExecutor = db.defaultExecutor
): Promise<SavingsGoal> {
  const row = await exec.get<Record<string, unknown>>(
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
  salary: number,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<void> {
  await exec.execute(
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

export async function removeRecurringExpense(id: number): Promise<void> {
  await db.execute("DELETE FROM recurring_expenses WHERE id = ?", [id]);
}

export async function setExpenseRecurring(
  expenseId: number,
  category: string,
  amount: number,
  recurring: boolean
): Promise<void> {
  await db.withTransaction(async (tx) => {
    await tx.execute("UPDATE expenses SET is_recurring = ? WHERE id = ?", [
      recurring ? 1 : 0,
      expenseId,
    ]);
    if (recurring) {
      const existingTemplate = await tx.get<Record<string, unknown>>(
        "SELECT id FROM recurring_expenses WHERE category = ? AND amount = ? LIMIT 1",
        [category, amount]
      );
      if (!existingTemplate) {
        await tx.execute(
          "INSERT INTO recurring_expenses (category, amount) VALUES (?, ?)",
          [category, amount]
        );
      }
      return;
    }
    const template = await tx.get<Record<string, unknown>>(
      "SELECT id FROM recurring_expenses WHERE category = ? AND amount = ? ORDER BY id LIMIT 1",
      [category, amount]
    );
    if (template) {
      await tx.execute("DELETE FROM recurring_expenses WHERE id = ?", [
        Number(template.id),
      ]);
    }
  });
}

export async function populateRecurringExpenses(
  budgetId: number,
  exec?: db.DbExecutor
): Promise<void> {
  if (!exec) {
    return db.withTransaction((tx) => populateRecurringExpenses(budgetId, tx));
  }
  const recurring = await exec.query<{ category: string; amount: number }>(
    "SELECT category, amount FROM recurring_expenses ORDER BY id"
  );
  const existing = await exec.query<{ category: string; amount: number }>(
    "SELECT category, amount FROM expenses WHERE budget_id = ? AND is_recurring = 1",
    [budgetId]
  );
  const existingKeys = new Set(existing.map((row) => JSON.stringify([row.category, row.amount])));
  for (const exp of recurring) {
    const key = JSON.stringify([exp.category, exp.amount]);
    if (existingKeys.has(key)) continue;
    await exec.execute(
      "INSERT INTO expenses (budget_id, category, amount, is_recurring) VALUES (?, ?, ?, 1)",
      [budgetId, exp.category, exp.amount]
    );
    existingKeys.add(key);
  }
}

// ---------------------------------------------------------------------------
// Per-month budget
// ---------------------------------------------------------------------------

export async function loadBudget(
  month: string,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<Budget | null> {
  const row = await exec.get<Record<string, unknown>>(
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
    cc2_paid: Number(row.cc2_paid) === 1,
    updated_at: String(row.updated_at),
  };
}

export async function saveBudget(
  month: string,
  income: number,
  loanPaid: boolean,
  ccPaid: boolean,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<Budget> {
  await exec.execute(
    `INSERT INTO budgets (month, income, loan_paid, cc_paid)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       income = excluded.income,
       loan_paid = excluded.loan_paid,
       cc_paid = excluded.cc_paid,
       updated_at = datetime('now')`,
    [month, income, loanPaid ? 1 : 0, ccPaid ? 1 : 0]
  );
  const saved = await loadBudget(month, exec);
  if (!saved) throw new Error("Failed to save budget.");
  return saved;
}

/** Create a month and its recurring expenses atomically; existing data is kept. */
export async function createBudgetMonth(month: string): Promise<{ budget: Budget; created: boolean }> {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Invalid budget month.");
  }
  return db.withTransaction(async (tx) => {
    const existing = await loadBudget(month, tx);
    if (existing) return { budget: existing, created: false };
    const previous = await loadBudget(addMonths(month, -1), tx);
    const { salary } = await loadSavingsGoal(tx);
    const income = previous && previous.income > 0 ? previous.income : salary;
    const budget = await saveBudget(month, income, false, false, tx);
    await populateRecurringExpenses(budget.id, tx);
    return { budget, created: true };
  });
}

export async function deleteBudget(
  month: string,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<void> {
  await clearRepaymentsForMonth(month, exec);
  // Exclusive transactions use a separate SQLite connection, where foreign
  // keys may be disabled. Remove children explicitly on that same executor.
  await exec.execute(
    "DELETE FROM expenses WHERE budget_id IN (SELECT id FROM budgets WHERE month = ?)",
    [month]
  );
  await exec.execute("DELETE FROM budgets WHERE month = ?", [month]);
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function listExpenses(
  budgetId: number,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<Expense[]> {
  const rows = await exec.query<Record<string, unknown>>(
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
  isRecurring: boolean = false,
  exec: db.DbExecutor = db.defaultExecutor
): Promise<Expense> {
  const result = await exec.execute(
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
  fields: Partial<Pick<Expense, "category" | "amount" | "paid" | "is_recurring">>,
  exec: db.DbExecutor = db.defaultExecutor
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
  await exec.execute(
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
    const existingTarget = await loadBudget(targetMonth);
    if (existingTarget) {
      return {
        budget: existingTarget,
        expenses: await listExpenses(existingTarget.id),
      };
    }
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
  if (toCopy.length > 0 && targetBudget) {
    const targetId = targetBudget.id;
    await db.withTransaction(async (tx) => {
      for (const exp of toCopy) {
        await tx.execute(
          "INSERT INTO expenses (budget_id, category, amount, paid, is_recurring) VALUES (?, ?, ?, ?, ?)",
          [
            targetId,
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

/** Monthly loan instalment, honouring a manual override when one is set. */
export function loanMonthlyPayment(loans: Loans): number {
  if (loans.loan_term <= 0) return 0;
  return loans.loan_payment > 0
    ? loans.loan_payment
    : loans.loan_amount > 0 ? pmt(loans.loan_amount, loans.loan_rate, loans.loan_term) : 0;
}

/** Legacy profiles have no bounded schedule; newly configured profiles do. */
export function loanPaymentForMonth(loans: Loans, month: string): number {
  const payment = loanMonthlyPayment(loans);
  if (payment <= 0 || !isCreditCardMonth(month)) return 0;
  if (loans.loan_schedule_mode !== null && loans.loan_start_month && month < loans.loan_start_month) return 0;
  if (loans.loan_schedule_mode !== null && loans.loan_end_month && month > loans.loan_end_month) return 0;
  return payment;
}

/** Aggregated month figures the dashboard card renders. */
export interface MonthSummaryInput {
  month: string;
  income: number;
  loanPaid: boolean;
  ccPaid: boolean;
  cc2Paid?: boolean;
  totalExpenses: number;
  paidExpenses: number;
}

/**
 * Pure month aggregation shared by the dashboard and the onboarding tutorial, so
 * both always agree on the numbers they show. Everything it needs arrives as an
 * argument: it never touches storage.
 */
export function computeMonthSummary(
  input: MonthSummaryInput,
  loans: Loans,
  goalAmount: number,
  repayments: readonly RepaymentPlan[] = [],
  paidRepayments: ReadonlySet<number> = new Set<number>()
): MonthSummary {
  const { month, income, loanPaid, ccPaid, totalExpenses, paidExpenses } = input;
  const loanPayment = loanPaymentForMonth(loans, month);
  const ccPayment = creditCardPaymentForMonth(creditCardDetails(loans, 1), month);
  const cc2Payment = creditCardPaymentForMonth(creditCardDetails(loans, 2), month);
  const extraPayments = repayments.map((plan) => ({ id: plan.id, amount: repaymentForMonth(plan, month) }));
  const extraPlanned = extraPayments.reduce((sum, item) => sum + item.amount, 0);
  const extraPaid = extraPayments.reduce((sum, item) => sum + (paidRepayments.has(item.id) ? item.amount : 0), 0);
  const outflow = loanPayment + ccPayment + cc2Payment + extraPlanned + totalExpenses + goalAmount;
  const actualOutflow =
    (loanPaid ? loanPayment : 0) + (ccPaid ? ccPayment : 0) + (input.cc2Paid ? cc2Payment : 0) + extraPaid + paidExpenses;
  const actualRemaining = income - actualOutflow;
  const goalProgress =
    goalAmount > 0
      ? Math.min(100, Math.max(0, (actualRemaining / goalAmount) * 100))
      : 0;
  return {
    month,
    income,
    outflow,
    remaining: income - outflow,
    actualOutflow,
    actualRemaining,
    savingsGoal: goalAmount,
    goalProgress,
    goalMet: goalAmount > 0 && actualRemaining >= goalAmount,
  };
}

export async function listMonthSummaries(
  loans: Loans
): Promise<MonthSummary[]> {
  const [savingsGoal, repayments, paidByMonth] = await Promise.all([
    loadSavingsGoal(), listRepaymentPlans(), allPaidRepayments(),
  ]);
  const goalAmt = savingsGoal.goal_amount;

  const rows = await db.query<Record<string, unknown>>(
    `SELECT
       b.month AS month,
       b.income AS income,
       b.loan_paid AS loan_paid,
       b.cc_paid AS cc_paid,
       b.cc2_paid AS cc2_paid,
       COALESCE(SUM(e.amount), 0) AS total_expenses,
       COALESCE(SUM(CASE WHEN e.paid = 1 THEN e.amount ELSE 0 END), 0) AS paid_expenses
     FROM budgets b
     LEFT JOIN expenses e ON e.budget_id = b.id
     GROUP BY b.id
     ORDER BY b.month DESC`
  );

  return rows.map((row) =>
    computeMonthSummary(
      {
        month: String(row.month),
        income: Number(row.income) || 0,
        loanPaid: Number(row.loan_paid) === 1,
        ccPaid: Number(row.cc_paid) === 1,
        cc2Paid: Number(row.cc2_paid) === 1,
        totalExpenses: Number(row.total_expenses) || 0,
        paidExpenses: Number(row.paid_expenses) || 0,
      },
      loans,
      goalAmt,
      repayments,
      paidByMonth.get(String(row.month))
    )
  );
}
