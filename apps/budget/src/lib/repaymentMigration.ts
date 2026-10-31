import * as db from "./db";
import { currentMonth, loadLoans, saveLoans } from "./budget";
import { creditCardDetails, creditCardScheduledMonths, hasCreditCard } from "./creditCards";
import { EMPTY_LOANS } from "../types/budget";
import { isValidRepaymentInput, repaymentForMonth, type RepaymentInput, type RepaymentPlan } from "./repaymentPlans";

type LegacySlot = "loan" | 1 | 2;

interface LegacyBudgetRow {
  month: string;
  loan_paid: number;
  cc_paid: number;
  cc2_paid: number;
}

function legacyPlanInputs(loans: Awaited<ReturnType<typeof loadLoans>>, firstBudgetMonth: string): { slot: LegacySlot; input: RepaymentInput }[] {
  const entries: { slot: LegacySlot; input: RepaymentInput }[] = [];
  if (loans.loan_amount > 0 || loans.loan_payment > 0) {
    const bounded = loans.loan_schedule_mode !== null && loans.loan_start_month !== null;
    entries.push({ slot: "loan", input: {
      kind: "loan", name: loans.loan_name || "Loan", amount: loans.loan_amount, apr: loans.loan_rate,
      payment: loans.loan_payment, term: loans.loan_term, monthsPaid: loans.loan_months_paid,
      startMonth: loans.loan_start_month ?? firstBudgetMonth,
      endMonth: bounded ? loans.loan_end_month : null, unbounded: !bounded,
    } });
  }
  for (const slot of [1, 2] as const) {
    const card = creditCardDetails(loans, slot);
    if (!hasCreditCard(card)) continue;
    const installment = card.planMode === "installment";
    entries.push({ slot, input: {
      kind: "card", name: card.name || (slot === 1 ? "Credit Card" : "Second Credit Card"),
      amount: card.balance, apr: installment ? 0 : card.apr,
      payment: installment ? 0 : card.payment,
      term: installment ? card.installments : creditCardScheduledMonths(card) ?? 0,
      monthsPaid: card.monthsPaid,
      startMonth: card.startMonth ?? firstBudgetMonth,
      endMonth: card.endMonth, unbounded: !installment,
    } });
  }
  return entries;
}

async function migrate(exec: db.DbExecutor): Promise<number[]> {
  const loans = await loadLoans(exec);
  const budgets = await exec.query<LegacyBudgetRow>("SELECT month, loan_paid, cc_paid, cc2_paid FROM budgets ORDER BY month");
  const inputs = legacyPlanInputs(loans, budgets[0]?.month ?? currentMonth());
  if (inputs.length === 0) return [];
  const ids: number[] = [];
  for (const { slot, input } of inputs) {
    if (!isValidRepaymentInput(input)) throw new Error(`Cannot migrate ${String(slot)} payment plan`);
    const result = await exec.execute(
      "INSERT INTO repayment_plans (kind, name, amount, apr, payment, term, months_paid, start_month, end_month, unbounded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [input.kind, input.name, input.amount, input.apr, input.payment, input.term, input.monthsPaid, input.startMonth, input.endMonth ?? null, input.unbounded ? 1 : 0]
    );
    const plan: RepaymentPlan = { ...input, id: result.lastId };
    ids.push(result.lastId);
    const activePaidMonths = budgets.filter((budget) => {
      const paid = slot === "loan" ? budget.loan_paid : slot === 1 ? budget.cc_paid : budget.cc2_paid;
      return paid === 1 && repaymentForMonth(plan, budget.month) > 0;
    });
    for (const [index, budget] of activePaidMonths.entries()) {
      await exec.execute("INSERT INTO repayment_payments (plan_id, month, counted) VALUES (?, ?, ?)", [plan.id, budget.month, index < input.monthsPaid ? 1 : 0]);
    }
  }
  await saveLoans({ ...EMPTY_LOANS }, exec);
  await exec.execute("UPDATE budgets SET loan_paid = 0, cc_paid = 0, cc2_paid = 0, loan_counter_incremented = 0");
  return ids;
}

export async function migrateLegacyRepayments(exec?: db.DbExecutor): Promise<number[]> {
  return exec ? migrate(exec) : db.withTransaction(migrate);
}
