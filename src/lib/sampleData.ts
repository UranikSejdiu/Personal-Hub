import * as SecureStore from "expo-secure-store";
import * as db from "./db";
import {
  addExpense,
  deleteBudget,
  loadLoans,
  loadSavingsGoal,
  saveBudget,
  saveLoans,
  saveSavingsGoal,
  updateExpense,
} from "./budget";
import { createChecklistNote, createNote, deleteNote } from "./notes";
import {
  SAMPLE_LOANS,
  SAMPLE_MONTHS,
  SAMPLE_NOTES,
  SAMPLE_SAVINGS,
  sampleExpenses,
  sampleMonthKey,
} from "./sampleDataset";
import { EMPTY_LOANS, type Loans } from "../types/budget";
import { migrateLegacyRepayments } from "./repaymentMigration";

const SAMPLE_STATE_KEY = "app_sample_data_state";

interface SampleDataRecord {
  state: "seeded" | "cleared";
  months: string[];
  noteIds: number[];
  planSnapshots?: { id: number; plan: Record<string, unknown>; payments: Record<string, unknown>[] }[];
}

/**
 * Tables that only ever hold data a human entered. Adding a new content table
 * means adding it here: a table missing from this list could make a populated
 * database look empty and let the seeder overwrite real data.
 */
const CONTENT_TABLES = [
  "tasks",
  "task_lists",
  "budgets",
  "expenses",
  "notes",
  "note_items",
  "dhikrs",
  "savings_transactions",
  "savings_auto_deposits",
  "recurring_expenses",
  "repayment_plans",
] as const;

function parseRecord(raw: string): SampleDataRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.state !== "seeded" && candidate.state !== "cleared") return null;
  return {
    state: candidate.state,
    months: Array.isArray(candidate.months)
      ? candidate.months.filter((month): month is string => typeof month === "string")
      : [],
    noteIds: Array.isArray(candidate.noteIds)
      ? candidate.noteIds.filter((id): id is number => typeof id === "number")
      : [],
    planSnapshots: Array.isArray(candidate.planSnapshots)
      ? candidate.planSnapshots.flatMap((snapshot): NonNullable<SampleDataRecord["planSnapshots"]> => {
          if (typeof snapshot !== "object" || snapshot === null) return [];
          const item = snapshot as Record<string, unknown>;
          if (!Number.isSafeInteger(item.id) || typeof item.id !== "number" || item.id <= 0 ||
              typeof item.plan !== "object" || item.plan === null || Array.isArray(item.plan) ||
              !Array.isArray(item.payments) || !item.payments.every((payment) => typeof payment === "object" && payment !== null && !Array.isArray(payment))) return [];
          return [{ id: item.id, plan: item.plan as Record<string, unknown>, payments: item.payments as Record<string, unknown>[] }];
        })
      : undefined,
  };
}

async function readRecord(): Promise<SampleDataRecord | null> {
  const raw = await SecureStore.getItemAsync(SAMPLE_STATE_KEY);
  return raw ? parseRecord(raw) : null;
}

async function writeRecord(record: SampleDataRecord): Promise<void> {
  await SecureStore.setItemAsync(SAMPLE_STATE_KEY, JSON.stringify(record));
}

function hasActivity(row: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => {
    const value = row[field];
    if (typeof value === "number") return value > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return false;
  });
}

const LOAN_FIELDS = [
  "loan_amount",
  "loan_rate",
  "loan_term",
  "loan_payment",
  "loan_start_date",
  "loan_name",
  "loan_months_paid",
  "loan_schedule_mode",
  "loan_start_month",
  "loan_end_month",
  "cc_balance",
  "cc_apr",
  "cc_payment",
  "cc_name",
  "cc_months_paid",
  "cc_start_month",
  "cc_end_month",
  "cc_plan_mode",
  "cc_installments",
  "cc2_balance",
  "cc2_apr",
  "cc2_payment",
  "cc2_name",
  "cc2_months_paid",
  "cc2_start_month",
  "cc2_end_month",
  "cc2_plan_mode",
  "cc2_installments",
];

const SAVINGS_FIELDS = ["goal_amount", "salary"];

/**
 * True only when no human-entered data exists anywhere. `loadLoans` and
 * `loadSavingsGoal` cannot answer this: they report zeros both for a missing row
 * and for a genuinely zero one, so the tables are counted directly.
 */
export async function isDatabaseEmpty(exec: db.DbExecutor = db.defaultExecutor): Promise<boolean> {
  for (const table of CONTENT_TABLES) {
    const row = await exec.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    if ((row?.count ?? 0) > 0) return false;
  }

  const loans = await exec.get<Record<string, unknown>>("SELECT * FROM loans WHERE id = 1");
  if (loans && hasActivity(loans, LOAN_FIELDS)) return false;

  const goal = await exec.get<Record<string, unknown>>(
    "SELECT * FROM savings_goals WHERE id = 1"
  );
  if (goal && hasActivity(goal, SAVINGS_FIELDS)) return false;

  return true;
}

/**
 * Whether demo data should be written. Content decides, not the flag: a
 * restored device or a cleared keychain can lose the flag while real data
 * survives, and clobbering that data is far worse than skipping a demo.
 */
export async function shouldSeedSampleData(): Promise<boolean> {
  if (await readRecord()) return false;
  return isDatabaseEmpty();
}

/** Whether the user still has the demo data and should be offered the reset. */
export async function hasSampleData(): Promise<boolean> {
  const record = await readRecord();
  return record?.state === "seeded";
}

/** Invalidate demo ownership before replacing database contents from a backup. */
export async function invalidateSampleData(): Promise<void> {
  // A restored backup may intentionally be empty. Keep a cleared marker so
  // the startup seeder does not turn that empty backup into demo content.
  await writeRecord({ state: "cleared", months: [], noteIds: [] });
}

function loansMatchSample(loans: Loans): boolean {
  return LOAN_FIELDS.every((field) => {
    const key = field as keyof Loans;
    return loans[key] === SAMPLE_LOANS[key];
  });
}

async function isUnchangedSampleNote(
  tx: db.DbExecutor,
  noteId: number,
  sample: (typeof SAMPLE_NOTES)[number] | undefined
): Promise<boolean> {
  if (!sample) return false;
  const note = await tx.get<Record<string, unknown>>("SELECT title, content, kind, is_pinned, is_archived, color FROM notes WHERE id = ?", [noteId]);
  if (!note || note.title !== sample.title || note.content !== sample.content ||
      note.kind !== sample.kind || note.is_pinned !== (sample.is_pinned ? 1 : 0) ||
      note.is_archived !== 0 || note.color !== sample.color) return false;

  const items = await tx.query<{ text: string; checked: number; position: number }>(
    "SELECT text, checked, position FROM note_items WHERE note_id = ? ORDER BY position, id", [noteId]
  );
  const expected = sample.items ?? [];
  return items.length === expected.length && items.every((item, index) =>
    item.text === expected[index].text && item.checked === (expected[index].checked ? 1 : 0) && item.position === index
  );
}

async function isUnchangedSampleMonth(
  tx: db.DbExecutor,
  key: string,
  sample: (typeof SAMPLE_MONTHS)[number] | undefined,
  removablePlanIds: ReadonlySet<number>
): Promise<boolean> {
  if (!sample) return false;
  const budget = await tx.get<{ id: number; income: number; loan_paid: number; cc_paid: number; cc2_paid: number }>(
    "SELECT id, income, loan_paid, cc_paid, cc2_paid FROM budgets WHERE month = ?", [key]
  );
  if (!budget || budget.income !== sample.income || budget.loan_paid !== (sample.loanPaid ? 1 : 0) ||
      budget.cc_paid !== (sample.ccPaid ? 1 : 0) || budget.cc2_paid !== 0) return false;

  const expenses = await tx.query<{ category: string; amount: number; paid: number; is_recurring: number }>(
    "SELECT category, amount, paid, is_recurring FROM expenses WHERE budget_id = ? ORDER BY id", [budget.id]
  );
  const expected = sampleExpenses(sample);
  if (expenses.length !== expected.length || !expenses.every((expense, index) =>
    expense.category === expected[index].category && expense.amount === expected[index].amount &&
    expense.paid === (expected[index].paid ? 1 : 0) &&
    expense.is_recurring === (expected[index].is_recurring ? 1 : 0)
  )) return false;

  // Removing a month also removes its payment history. Preserve the month if
  // any payment belongs to a user plan or to an edited sample plan.
  const payments = await tx.query<{ plan_id: number }>(
    "SELECT plan_id FROM repayment_payments WHERE month = ?", [key]
  );
  return payments.every((payment) => removablePlanIds.has(payment.plan_id));
}

/**
 * Writes the demo dataset. Runs in one transaction so an interrupted seed leaves
 * an untouched database, and the record is stored only after that transaction
 * commits, so a crash mid-seed simply retries on the next launch.
 */
export async function seedSampleData(): Promise<void> {
  if (!(await shouldSeedSampleData())) return;

  const months: string[] = [];
  const noteIds: number[] = [];
  const planSnapshots: NonNullable<SampleDataRecord["planSnapshots"]> = [];
  let seeded = false;

  await db.withTransaction(async (tx) => {
    // Recheck after acquiring the write queue: a user write may have landed
    // between the initial emptiness check and this transaction.
    if (!(await isDatabaseEmpty(tx))) return;
    await saveLoans(SAMPLE_LOANS, tx);
    await saveSavingsGoal(SAMPLE_SAVINGS.goal_amount, SAMPLE_SAVINGS.salary, tx);

    for (const month of SAMPLE_MONTHS) {
      const key = sampleMonthKey(month);
      const budget = await saveBudget(
        key,
        month.income,
        month.loanPaid,
        month.ccPaid,
        tx
      );
      for (const expense of sampleExpenses(month)) {
        const created = await addExpense(
          budget.id,
          expense.category,
          expense.amount,
          expense.is_recurring,
          tx
        );
        if (expense.paid) {
          await updateExpense(created.id, { paid: true }, tx);
        }
      }
      months.push(key);
    }

    const planIds = await migrateLegacyRepayments(tx);
    for (const id of planIds) {
      const plan = await tx.get<Record<string, unknown>>("SELECT * FROM repayment_plans WHERE id = ?", [id]);
      if (plan) planSnapshots.push({ id, plan, payments: await tx.query<Record<string, unknown>>("SELECT * FROM repayment_payments WHERE plan_id = ? ORDER BY month", [id]) });
    }

    for (const note of SAMPLE_NOTES) {
      const created =
        note.kind === "checklist"
          ? await createChecklistNote(
              { title: note.title, is_pinned: note.is_pinned },
              note.items ?? [],
              tx
            )
          : await createNote(
              {
                title: note.title,
                content: note.content,
                is_pinned: note.is_pinned,
              },
              tx
            );
      noteIds.push(created.id);
    }
    seeded = true;
  });

  if (seeded) await writeRecord({ state: "seeded", months, noteIds, planSnapshots });
}

/**
 * Removes only demo rows that still match the bundled sample. Older ownership
 * records also use this comparison; if the sample changed between releases,
 * preserving a row is safer than deleting a user's edits.
 *
 * The loan and savings singletons are only reset while they still hold the demo
 * values, so real figures entered after seeding are never discarded.
 */
export async function clearSampleData(): Promise<boolean> {
  const record = await readRecord();
  if (!record || record.state !== "seeded") return false;

  await db.withTransaction(async (tx) => {
    const unchangedPlans: NonNullable<SampleDataRecord["planSnapshots"]> = [];
    for (const snapshot of record.planSnapshots ?? []) {
      const plan = await tx.get<Record<string, unknown>>("SELECT * FROM repayment_plans WHERE id = ?", [snapshot.id]);
      const payments = await tx.query<Record<string, unknown>>("SELECT * FROM repayment_payments WHERE plan_id = ? ORDER BY month", [snapshot.id]);
      if (plan && JSON.stringify(plan) === JSON.stringify(snapshot.plan) && JSON.stringify(payments) === JSON.stringify(snapshot.payments)) {
        unchangedPlans.push(snapshot);
      }
    }
    const candidatePlanIds = new Set(unchangedPlans.map((snapshot) => snapshot.id));
    const allMonthsUnchanged = (await Promise.all(record.months.map((month, index) =>
      isUnchangedSampleMonth(tx, month, SAMPLE_MONTHS[index], candidatePlanIds)
    ))).every(Boolean);
    // A sample plan may still be useful to an edited month. Keep every plan
    // when any owned month has changed, and only remove payment-free months.
    const removablePlanIds = allMonthsUnchanged ? candidatePlanIds : new Set<number>();
    if (allMonthsUnchanged) {
      for (const snapshot of unchangedPlans) {
        await tx.execute("DELETE FROM repayment_payments WHERE plan_id = ?", [snapshot.id]);
        await tx.execute("DELETE FROM repayment_plans WHERE id = ?", [snapshot.id]);
      }
    }
    for (const [index, noteId] of record.noteIds.entries()) {
      if (await isUnchangedSampleNote(tx, noteId, SAMPLE_NOTES[index])) {
        await deleteNote(noteId, tx);
      }
    }

    for (const [index, month] of record.months.entries()) {
      if (await isUnchangedSampleMonth(tx, month, SAMPLE_MONTHS[index], removablePlanIds)) {
        await deleteBudget(month, tx);
      }
    }

    // The legacy loan fields still describe sample plans. If a plan was
    // changed, keep those fields as well so the two representations agree.
    if (allMonthsUnchanged && unchangedPlans.length === (record.planSnapshots?.length ?? 0) &&
        loansMatchSample(await loadLoans(tx))) {
      await saveLoans({ ...EMPTY_LOANS }, tx);
    }

    const goal = await loadSavingsGoal(tx);
    if (
      goal.goal_amount === SAMPLE_SAVINGS.goal_amount &&
      goal.salary === SAMPLE_SAVINGS.salary
    ) {
      await saveSavingsGoal(0, 0, tx);
    }
  });

  await writeRecord({ state: "cleared", months: record.months, noteIds: record.noteIds });
  return true;
}
