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
import { createNote, deleteNote } from "./notes";
import {
  SAMPLE_LOANS,
  SAMPLE_MONTHS,
  SAMPLE_NOTES,
  SAMPLE_SAVINGS,
  sampleExpenses,
  sampleMonthKey,
} from "./sampleDataset";
import { EMPTY_LOANS, type Loans } from "../types/budget";

const SAMPLE_STATE_KEY = "app_sample_data_state";

interface SampleDataRecord {
  state: "seeded" | "cleared";
  months: string[];
  noteIds: number[];
}

/**
 * Tables that only ever hold data a human entered. Adding a new content table
 * means adding it here: a table missing from this list could make a populated
 * database look empty and let the seeder overwrite real data.
 */
const CONTENT_TABLES = [
  "budgets",
  "expenses",
  "notes",
  "dhikrs",
  "savings_transactions",
  "savings_auto_deposits",
  "recurring_expenses",
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
  "cc_balance",
  "cc_apr",
  "cc_payment",
  "cc_name",
  "cc_months_paid",
];

const SAVINGS_FIELDS = ["goal_amount", "salary"];

/**
 * True only when no human-entered data exists anywhere. `loadLoans` and
 * `loadSavingsGoal` cannot answer this: they report zeros both for a missing row
 * and for a genuinely zero one, so the tables are counted directly.
 */
export async function isDatabaseEmpty(): Promise<boolean> {
  for (const table of CONTENT_TABLES) {
    const row = await db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    if ((row?.count ?? 0) > 0) return false;
  }

  const loans = await db.get<Record<string, unknown>>("SELECT * FROM loans WHERE id = 1");
  if (loans && hasActivity(loans, LOAN_FIELDS)) return false;

  const goal = await db.get<Record<string, unknown>>(
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

function loansMatchSample(loans: Loans): boolean {
  return LOAN_FIELDS.every((field) => {
    const key = field as keyof Loans;
    return loans[key] === SAMPLE_LOANS[key];
  });
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

  await db.withTransaction(async () => {
    await saveLoans(SAMPLE_LOANS);
    await saveSavingsGoal(SAMPLE_SAVINGS.goal_amount, SAMPLE_SAVINGS.salary);

    for (const month of SAMPLE_MONTHS) {
      const key = sampleMonthKey(month);
      const budget = await saveBudget(key, month.income, month.loanPaid, month.ccPaid);
      for (const expense of sampleExpenses(month)) {
        const created = await addExpense(
          budget.id,
          expense.category,
          expense.amount,
          expense.is_recurring
        );
        if (expense.paid) {
          await updateExpense(created.id, { paid: true });
        }
      }
      months.push(key);
    }

    for (const note of SAMPLE_NOTES) {
      const created = await createNote({
        title: note.title,
        content: note.content,
        is_pinned: note.is_pinned,
      });
      noteIds.push(created.id);
    }
  });

  await writeRecord({ state: "seeded", months, noteIds });
}

/**
 * Removes the demo rows recorded at seed time. Deletes are driven by the stored
 * ids rather than today's dataset, so the reset still works after a later
 * version changes what the demo looks like.
 *
 * The loan and savings singletons are only reset while they still hold the demo
 * values, so real figures entered after seeding are never discarded.
 */
export async function clearSampleData(): Promise<boolean> {
  const record = await readRecord();
  if (!record || record.state !== "seeded") return false;

  await db.withTransaction(async () => {
    for (const noteId of record.noteIds) {
      const note = await db.get<{ id: number }>("SELECT id FROM notes WHERE id = ?", [noteId]);
      if (note) await deleteNote(noteId);
    }

    for (const month of record.months) {
      const budget = await db.get<{ id: number }>(
        "SELECT id FROM budgets WHERE month = ?",
        [month]
      );
      if (budget) await deleteBudget(month);
    }

    if (record.months.length > 0) {
      const placeholders = record.months.map(() => "?").join(", ");
      await db.execute(
        `DELETE FROM savings_auto_deposits WHERE month IN (${placeholders})`,
        record.months
      );
    }

    if (loansMatchSample(await loadLoans())) {
      await saveLoans({ ...EMPTY_LOANS });
    }

    const goal = await loadSavingsGoal();
    if (
      goal.goal_amount === SAMPLE_SAVINGS.goal_amount &&
      goal.salary === SAMPLE_SAVINGS.salary
    ) {
      await saveSavingsGoal(0, 0);
    }
  });

  await writeRecord({ state: "cleared", months: record.months, noteIds: record.noteIds });
  return true;
}
