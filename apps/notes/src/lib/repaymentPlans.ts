import * as db from "./db";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS, pmt } from "./calculations";
import { installmentEndMonth, installmentPayments, isCreditCardMonth } from "./creditCards";

export type RepaymentKind = "loan" | "card";

export interface RepaymentPlan {
  id: number;
  kind: RepaymentKind;
  name: string;
  amount: number;
  apr: number;
  payment: number;
  term: number;
  monthsPaid: number;
  startMonth: string;
  endMonth?: string | null;
  unbounded?: boolean;
}

export type RepaymentInput = Omit<RepaymentPlan, "id">;

function parsePlan(row: Record<string, unknown>): RepaymentPlan {
  return {
    id: Number(row.id),
    kind: row.kind === "card" ? "card" : "loan",
    name: String(row.name ?? ""),
    amount: Number(row.amount),
    apr: Number(row.apr),
    payment: Number(row.payment),
    term: Number(row.term),
    monthsPaid: Number(row.months_paid),
    startMonth: String(row.start_month),
    endMonth: typeof row.end_month === "string" ? row.end_month : null,
    unbounded: Number(row.unbounded) === 1,
  };
}

export function isValidRepaymentInput(plan: RepaymentInput): boolean {
  if (plan.kind !== "loan" && plan.kind !== "card") return false;
  if (typeof plan.name !== "string" || !plan.name.trim() || plan.name.trim().length > 100) return false;
  if (!Number.isFinite(plan.amount) || plan.amount < 0 || plan.amount > MAX_LOAN_AMOUNT) return false;
  if (!Number.isFinite(plan.apr) || plan.apr < 0 || plan.apr > MAX_LOAN_ANNUAL_RATE) return false;
  if (!Number.isFinite(plan.payment) || plan.payment < 0 || plan.payment > MAX_LOAN_AMOUNT) return false;
  if (!Number.isSafeInteger(plan.term) || plan.term < 0 || plan.term > MAX_LOAN_TERM_MONTHS || (!plan.unbounded && plan.term === 0)) return false;
  if (!Number.isSafeInteger(plan.monthsPaid) || plan.monthsPaid < 0 || plan.monthsPaid > MAX_LOAN_TERM_MONTHS || (!plan.unbounded && plan.monthsPaid > plan.term)) return false;
  if (!isCreditCardMonth(plan.startMonth) || (!plan.unbounded && !installmentEndMonth(plan.startMonth, plan.term))) return false;
  if (plan.endMonth != null && (!isCreditCardMonth(plan.endMonth) || plan.endMonth < plan.startMonth)) return false;
  if (plan.kind === "card") return plan.unbounded ? plan.payment > 0 || plan.amount > 0 : plan.apr === 0 && plan.payment === 0 && installmentPayments({ balance: plan.amount, installments: plan.term }) !== null;
  if (plan.unbounded) return plan.payment > 0 || plan.amount > 0;
  return plan.payment > 0 || (plan.amount > 0 && pmt(plan.amount, plan.apr, plan.term) > 0);
}

export async function listRepaymentPlans(exec: db.DbExecutor = db.defaultExecutor): Promise<RepaymentPlan[]> {
  const rows = await exec.query<Record<string, unknown>>("SELECT * FROM repayment_plans ORDER BY id DESC");
  return rows.map(parsePlan);
}

export async function saveRepaymentPlan(plan: RepaymentInput, id?: number): Promise<RepaymentPlan> {
  if (!isValidRepaymentInput(plan) || (id !== undefined && (!Number.isSafeInteger(id) || id <= 0))) {
    throw new Error("Invalid repayment plan");
  }
  return db.withTransaction(async (tx) => {
    let savedId = id;
    if (savedId !== undefined) {
      const existing = await tx.get<Record<string, unknown>>("SELECT * FROM repayment_plans WHERE id = ?", [savedId]);
      if (!existing) throw new Error("Repayment plan not found");
      const current = parsePlan(existing);
      const paidMonths = await tx.query<{ month: string }>("SELECT month FROM repayment_payments WHERE plan_id = ?", [savedId]);
      if (plan.kind !== current.kind || plan.monthsPaid !== current.monthsPaid || paidMonths.some(({ month }) => repaymentForMonth({ ...plan, id: savedId! }, month) <= 0)) {
        throw new Error("Existing payments must remain in the plan schedule");
      }
      await tx.execute(
        `UPDATE repayment_plans SET kind = ?, name = ?, amount = ?, apr = ?, payment = ?, term = ?, months_paid = ?, start_month = ?, end_month = ?, unbounded = ? WHERE id = ?`,
        [plan.kind, plan.name.trim(), plan.amount, plan.apr, plan.payment, plan.term, current.monthsPaid, plan.startMonth, plan.endMonth ?? null, plan.unbounded ? 1 : 0, savedId]
      );
    } else {
      const result = await tx.execute(
        `INSERT INTO repayment_plans (kind, name, amount, apr, payment, term, months_paid, start_month, end_month, unbounded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plan.kind, plan.name.trim(), plan.amount, plan.apr, plan.payment, plan.term, plan.monthsPaid, plan.startMonth, plan.endMonth ?? null, plan.unbounded ? 1 : 0]
      );
      savedId = result.lastId;
    }
    const row = await tx.get<Record<string, unknown>>("SELECT * FROM repayment_plans WHERE id = ?", [savedId]);
    if (!row) throw new Error("Failed to save repayment plan");
    return parsePlan(row);
  });
}

export async function removeRepaymentPlan(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid repayment plan ID");
  await db.withTransaction(async (tx) => {
    await tx.execute("DELETE FROM repayment_payments WHERE plan_id = ?", [id]);
    await tx.execute("DELETE FROM repayment_plans WHERE id = ?", [id]);
  });
}

export function repaymentForMonth(plan: RepaymentPlan, month: string): number {
  if (!isCreditCardMonth(month) || month < plan.startMonth) return 0;
  const end = plan.endMonth ?? (plan.unbounded ? null : installmentEndMonth(plan.startMonth, plan.term));
  if (end && month > end) return 0;
  if (plan.kind === "card" && !plan.unbounded) {
    const installments = installmentPayments({ balance: plan.amount, installments: plan.term });
    return installments ? (month === end ? installments.final : installments.regular) : 0;
  }
  return plan.payment > 0 ? plan.payment : pmt(plan.amount, plan.apr, plan.term);
}

export async function paidRepaymentIds(month: string, exec: db.DbExecutor = db.defaultExecutor): Promise<Set<number>> {
  const rows = await exec.query<{ plan_id: number }>("SELECT plan_id FROM repayment_payments WHERE month = ?", [month]);
  return new Set(rows.map((row) => row.plan_id));
}

export async function allPaidRepayments(exec: db.DbExecutor = db.defaultExecutor): Promise<Map<string, Set<number>>> {
  const rows = await exec.query<{ plan_id: number; month: string }>("SELECT plan_id, month FROM repayment_payments");
  const byMonth = new Map<string, Set<number>>();
  for (const row of rows) {
    const ids = byMonth.get(row.month) ?? new Set<number>();
    ids.add(row.plan_id);
    byMonth.set(row.month, ids);
  }
  return byMonth;
}

export async function setRepaymentPaid(planId: number, month: string, paid: boolean): Promise<RepaymentPlan> {
  if (!Number.isSafeInteger(planId) || planId <= 0 || !isCreditCardMonth(month)) throw new Error("Invalid payment reference");
  return db.withTransaction(async (tx) => {
    const row = await tx.get<Record<string, unknown>>("SELECT * FROM repayment_plans WHERE id = ?", [planId]);
    if (!row) throw new Error("Repayment plan not found");
    const plan = parsePlan(row);
    const prior = await tx.get<{ counted: number }>("SELECT counted FROM repayment_payments WHERE plan_id = ? AND month = ?", [planId, month]);
    if (Boolean(prior) === paid) return plan;
    if (paid) {
      if (repaymentForMonth(plan, month) <= 0) throw new Error("No payment scheduled for this month");
      const counted = plan.term === 0 || plan.monthsPaid < plan.term ? 1 : 0;
      await tx.execute("INSERT INTO repayment_payments (plan_id, month, counted) VALUES (?, ?, ?)", [planId, month, counted]);
      plan.monthsPaid += counted;
    } else {
      await tx.execute("DELETE FROM repayment_payments WHERE plan_id = ? AND month = ?", [planId, month]);
      plan.monthsPaid = Math.max(0, plan.monthsPaid - (prior?.counted ?? 0));
    }
    await tx.execute("UPDATE repayment_plans SET months_paid = ? WHERE id = ?", [plan.monthsPaid, planId]);
    return plan;
  });
}

/** Removing a budget month must undo only counter increments owned by that month. */
export async function clearRepaymentsForMonth(month: string, exec: db.DbExecutor): Promise<void> {
  const rows = await exec.query<{ plan_id: number; counted: number }>(
    "SELECT plan_id, counted FROM repayment_payments WHERE month = ?", [month]
  );
  for (const row of rows) {
    if (row.counted) {
      await exec.execute("UPDATE repayment_plans SET months_paid = MAX(0, months_paid - 1) WHERE id = ?", [row.plan_id]);
    }
  }
  await exec.execute("DELETE FROM repayment_payments WHERE month = ?", [month]);
}
