import { addMonths, computeMonthSummary, currentMonth } from "./budget";
import type {
  Expense,
  Loans,
  MonthSummary,
  SavingsGoal,
} from "../types/budget";
import { EMPTY_LOANS } from "../types/budget";
import type { Note, NoteKind } from "../types/notes";
import type { NoteColor } from "../constants/theme";

/**
 * Single source of truth for the demo dataset.
 *
 * Both the onboarding tutorial and the first-run seeder build from this, so the
 * tour and a freshly seeded app always show the same loan, months and notes and
 * can never disagree with each other or with the real calculations.
 *
 * Nothing here is ever written into a user's own data implicitly: the seeder
 * refuses to run unless the database is completely empty.
 */

export interface SampleMonth {
  /** Offset in months from the current month. 0 is the month in progress. */
  offset: number;
  income: number;
  loanPaid: boolean;
  ccPaid: boolean;
  expenses: { category: string; amount: number; paid: boolean }[];
}

export const SAMPLE_SAVINGS: SavingsGoal = { goal_amount: 1200, salary: 2500 };

/**
 * Dhikr is deliberately not written to the database on first run: the counts are
 * personal, and a stale `dhikr_selected_id` in storage would dangle if the demo
 * entry were later removed. The tour still shows the real shape of the counter.
 */
export const SAMPLE_DHIKR = { name: "Istighfar", dailyLimit: 100 as number | null };

export const SAMPLE_LOANS: Loans = {
  ...EMPTY_LOANS,
  loan_name: "Home Loan",
  loan_amount: 45000,
  loan_rate: 4.9,
  loan_term: 120,
  loan_start_date: "2023-01-05",
  loan_payment_day: 5,
  loan_months_paid: 36,
  cc_name: "Everyday Card",
  cc_balance: 1200,
  cc_apr: 18.9,
  cc_payment: 150,
  cc_months_paid: 8,
};

/** Previous month is fully settled; the current month is still in progress. */
export const SAMPLE_MONTHS: SampleMonth[] = [
  {
    offset: -1,
    income: 2500,
    loanPaid: true,
    ccPaid: true,
    expenses: [
      { category: "Rent", amount: 950, paid: true },
      { category: "Groceries", amount: 320, paid: true },
      { category: "Utilities", amount: 140, paid: true },
      { category: "Transport", amount: 85, paid: true },
    ],
  },
  {
    offset: 0,
    income: 2500,
    loanPaid: false,
    ccPaid: false,
    expenses: [
      { category: "Rent", amount: 950, paid: true },
      { category: "Groceries", amount: 268, paid: true },
      { category: "Utilities", amount: 140, paid: false },
      { category: "Transport", amount: 60, paid: false },
      { category: "Dining out", amount: 132, paid: false },
    ],
  },
];

const NOTE_COLOR: NoteColor = "default";

/** Note bodies use the same Lexical editor HTML the real editor produces. */
export const SAMPLE_NOTES: {
  title: string;
  content: string;
  kind: NoteKind;
  is_pinned: boolean;
  color: NoteColor;
  items?: { text: string; checked: boolean }[];
}[] = [
  {
    title: "Welcome to Personal Hub",
    content:
      '<p>This is a sample note. Tap the card to open the editor, or the <strong>+</strong> button to write your own.</p><ul><li><s>Rich text works</s> — bold, italic and lists</li><li>Checkbox lists: tap a box to tick it off</li><li>Pin a note to keep it at the top</li></ul>',
    kind: "text",
    is_pinned: true,
    color: NOTE_COLOR,
  },
  {
    title: "Shopping list",
    content: "",
    kind: "checklist",
    is_pinned: false,
    color: NOTE_COLOR,
    items: [
      { text: "Oat milk", checked: false },
      { text: "Coffee beans", checked: true },
      { text: "Rice", checked: false },
      { text: "Eggs", checked: false },
    ],
  },
];

/** "YYYY-MM" key for a sample month, resolved against the current month. */
export function sampleMonthKey(month: SampleMonth): string {
  return addMonths(currentMonth(), month.offset);
}

/** Expenses of a sample month, minus the columns SQLite assigns. */
export function sampleExpenses(month: SampleMonth): Omit<Expense, "id" | "budget_id">[] {
  return month.expenses.map((expense) => ({
    category: expense.category,
    amount: expense.amount,
    paid: expense.paid,
    is_recurring: false,
  }));
}

/** A complete `Note` for previews, with the columns SQLite assigns filled in. */
export function sampleNote(
  index: number,
  createdAt: string,
  updatedAt: string
): Note {
  const source = SAMPLE_NOTES[index];
  return {
    id: index + 1,
    title: source.title,
    content: source.content,
    kind: source.kind,
    is_pinned: source.is_pinned,
    is_archived: false,
    color: source.color,
    created_at: createdAt,
    updated_at: updatedAt,
    items: source.items?.map((item, position) => ({
      id: index * 100 + position,
      note_id: index + 1,
      text: item.text,
      checked: item.checked,
      position,
    })),
  };
}

/**
 * Dashboard summary for a sample month, produced by the same pure aggregation
 * the real dashboard uses, so the tutorial can never show a figure the app
 * would not show.
 */
export function sampleMonthSummary(month: SampleMonth): MonthSummary {
  const totalExpenses = month.expenses.reduce((sum, e) => sum + e.amount, 0);
  const paidExpenses = month.expenses.reduce(
    (sum, e) => sum + (e.paid ? e.amount : 0),
    0
  );
  return computeMonthSummary(
    {
      month: sampleMonthKey(month),
      income: month.income,
      loanPaid: month.loanPaid,
      ccPaid: month.ccPaid,
      totalExpenses,
      paidExpenses,
    },
    SAMPLE_LOANS,
    SAMPLE_SAVINGS.goal_amount
  );
}

/** The sample month currently in progress. */
export function currentSampleMonth(): SampleMonth {
  return SAMPLE_MONTHS.find((month) => month.offset === 0) ?? SAMPLE_MONTHS[0];
}
