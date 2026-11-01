import { NOTE_COLORS } from "../constants/theme";
import { MAX_LOAN_AMOUNT, MAX_LOAN_ANNUAL_RATE, MAX_LOAN_TERM_MONTHS } from "./calculations";
import { creditCardScheduledMonths, installmentEndMonth, installmentPayments, isCreditCardScheduleValid } from "./creditCards";
import { isValidRepaymentInput, repaymentForMonth, type RepaymentInput, type RepaymentPlan } from "./repaymentPlans";
import { isTaskDate, isTaskInput, isTaskTime } from "./taskDates";
export const BACKUP_FORMAT = "personal-hub.backup";
export const BACKUP_VERSION = 7;

export interface BackupEnvelope {
  meta: {
    format: typeof BACKUP_FORMAT;
    version: number;
    appVersion: string;
    exportedAt: string;
    platform: string;
  };
  tables: {
    loans: Record<string, unknown> | null;
    savingsGoal: Record<string, unknown> | null;
    budgets: Record<string, unknown>[];
    expenses: Record<string, unknown>[];
    recurringExpenses: Record<string, unknown>[];
    autoDeposits: Record<string, unknown>[];
    transactions: Record<string, unknown>[];
    notes: Record<string, unknown>[];
    /**
     * Checklist items. Optional: backups written before checklist notes
     * existed omit this, and are restored with no items.
     */
    noteItems?: Record<string, unknown>[];
    repaymentPlans?: Record<string, unknown>[];
    repaymentPayments?: Record<string, unknown>[];
    taskLists?: Record<string, unknown>[];
    tasks?: Record<string, unknown>[];
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isValidMonth(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return false;
  return true;
}

function isValidDate(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isSafeInteger(v);
}

function isBinaryFlag(v: unknown): v is 0 | 1 {
  return v === 0 || v === 1;
}

function requiredString(row: Record<string, unknown>, key: string): boolean {
  return typeof row[key] === "string";
}

function optionalString(row: Record<string, unknown>, key: string): boolean {
  return row[key] === undefined || typeof row[key] === "string";
}

function optionalId(row: Record<string, unknown>): boolean {
  return row.id === undefined || (isInteger(row.id) && row.id > 0);
}

function validateLoans(row: Record<string, unknown>): string | null {
  for (const key of ["cc2_balance", "cc2_apr", "cc2_payment", "cc2_months_paid"]) {
    const value = row[key];
    if (value === undefined) continue; // Legacy backups have only the first card.
    if (!isFiniteNumber(value) || value < 0 ||
        (key === "cc2_months_paid" ? !Number.isSafeInteger(value) || value > MAX_LOAN_TERM_MONTHS : key !== "cc2_apr" && value > MAX_LOAN_AMOUNT)) {
      return `loans.${key} invalid`;
    }
  }
  for (const prefix of ["cc", "cc2"]) {
    const start = row[`${prefix}_start_month`];
    const end = row[`${prefix}_end_month`];
    if ((start != null && typeof start !== "string") || (end != null && typeof end !== "string") ||
        !isCreditCardScheduleValid({ startMonth: typeof start === "string" ? start : null, endMonth: typeof end === "string" ? end : null })) {
      return `loans.${prefix} schedule invalid`;
    }
    const planMode = row[`${prefix}_plan_mode`] ?? null;
    const installments = row[`${prefix}_installments`] ?? 0;
    if (planMode !== null && planMode !== "installment") return `loans.${prefix} plan mode invalid`;
    if (!isInteger(installments) || installments < 0 || installments > MAX_LOAN_TERM_MONTHS) return `loans.${prefix} installments invalid`;
    if (planMode === null && installments !== 0) return `loans.${prefix} plan incomplete`;
    if (planMode === "installment") {
      const balance = row[`${prefix}_balance`];
      const payment = row[`${prefix}_payment`];
      const apr = row[`${prefix}_apr`];
      const monthsPaid = row[`${prefix}_months_paid`];
      const amounts = installmentPayments({ balance: typeof balance === "number" ? balance : NaN, installments });
      if (!amounts || typeof start !== "string" || end !== installmentEndMonth(start, installments) ||
          apr !== 0 || !isFiniteNumber(payment) || Math.round(payment * 100) !== Math.round(amounts.regular * 100) ||
          !isInteger(monthsPaid) || monthsPaid > installments) return `loans.${prefix} plan invalid`;
    }
  }
  if (!optionalString(row, "cc2_name")) return "loans.cc2_name invalid";
  if (row.id !== undefined && row.id !== 1) return "loans.id must be 1";
  for (const key of ["loan_amount", "loan_rate", "loan_payment", "cc_balance", "cc_apr", "cc_payment"]) {
    if (!isFiniteNumber(row[key])) return `loans.${key} invalid`;
    if (row[key] < 0) return `loans.${key} must be non-negative`;
  }
  for (const key of ["loan_term", "loan_payment_day", "loan_months_paid", "cc_months_paid"]) {
    if (!isInteger(row[key])) return `loans.${key} invalid`;
  }
  if (Number(row.loan_term) < 0 || Number(row.loan_months_paid) < 0 || Number(row.cc_months_paid) < 0) {
    return "loans month counts must be non-negative";
  }
  if (Number(row.loan_payment_day) < 1 || Number(row.loan_payment_day) > 31) {
    return "loans.loan_payment_day invalid";
  }
  if (Number(row.loan_term) > MAX_LOAN_TERM_MONTHS || Number(row.loan_months_paid) > MAX_LOAN_TERM_MONTHS ||
      Number(row.cc_months_paid) > MAX_LOAN_TERM_MONTHS || Number(row.loan_rate) > MAX_LOAN_ANNUAL_RATE ||
      Number(row.loan_amount) > MAX_LOAN_AMOUNT || Number(row.loan_payment) > MAX_LOAN_AMOUNT) {
    return "loans values out of range";
  }
  if (row.loan_start_date !== null && row.loan_start_date !== undefined && !isValidDate(row.loan_start_date)) return "loans.loan_start_date invalid";
  if (!optionalString(row, "loan_name") || !optionalString(row, "cc_name")) return "loans names invalid";
  const mode = row.loan_schedule_mode ?? null;
  const start = row.loan_start_month ?? null;
  const end = row.loan_end_month ?? null;
  if (mode !== null && mode !== "count" && mode !== "dates") return "loans.loan_schedule_mode invalid";
  if ((start !== null && typeof start !== "string") || (end !== null && typeof end !== "string") ||
      !isCreditCardScheduleValid({ startMonth: typeof start === "string" ? start : null, endMonth: typeof end === "string" ? end : null })) return "loans.loan schedule invalid";
  if (mode !== null && (start === null || end === null || Number(row.loan_term) <= 0 || Number(row.loan_months_paid) > Number(row.loan_term))) return "loans.loan schedule incomplete";
  if (mode === "dates" && typeof start === "string" && typeof end === "string" &&
      creditCardScheduledMonths({ startMonth: start, endMonth: end }) !== row.loan_term) return "loans.loan schedule duration invalid";
  return null;
}

function validateSavingsGoal(row: Record<string, unknown>): string | null {
  if (row.id !== undefined && row.id !== 1) return "savingsGoal.id must be 1";
  if (!isFiniteNumber(row.goal_amount) || !isFiniteNumber(row.salary)) return "savingsGoal numeric fields invalid";
  if (row.goal_amount < 0 || row.salary < 0) return "savingsGoal amounts must be non-negative";
  return null;
}

function validateBudget(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !isValidMonth(row.month) || !isFiniteNumber(row.income)) return "budget fields invalid";
  if (row.income < 0) return "budget.income must be non-negative";
  if (row.savings_goal !== undefined && (!isFiniteNumber(row.savings_goal) || row.savings_goal < 0 || row.savings_goal > Number.MAX_SAFE_INTEGER / 100)) return "budget.savings_goal invalid";
  if (row.loan_paid !== undefined && !isBinaryFlag(row.loan_paid)) return "budget.loan_paid invalid";
  if (row.cc_paid !== undefined && !isBinaryFlag(row.cc_paid)) return "budget.cc_paid invalid";
  if (row.cc2_paid !== undefined && !isBinaryFlag(row.cc2_paid)) return "budget.cc2_paid invalid";
  if (row.loan_counter_incremented !== undefined && row.loan_counter_incremented !== null &&
      !isBinaryFlag(row.loan_counter_incremented)) return "budget.loan_counter_incremented invalid";
  if (!optionalString(row, "updated_at")) return "budget.updated_at invalid";
  return null;
}

function validateExpense(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "category") || !isFiniteNumber(row.amount)) return "expense fields invalid";
  if (row.amount < 0) return "expense.amount must be non-negative";
  if (row.budget_id !== undefined && (!isInteger(row.budget_id) || row.budget_id <= 0)) return "expense.budget_id invalid";
  if (row.budget_month !== undefined && !isValidMonth(row.budget_month)) return "expense.budget_month invalid";
  if (row.budget_id === undefined && row.budget_month === undefined) return "expense has no budget reference";
  for (const key of ["paid", "is_recurring"]) if (row[key] !== undefined && !isBinaryFlag(row[key])) return `expense.${key} invalid`;
  return null;
}

function validateRecurringExpense(row: Record<string, unknown>): string | null {
  return !optionalId(row) || !requiredString(row, "category") || !isFiniteNumber(row.amount) || row.amount < 0 ? "recurring expense fields invalid" : null;
}

function validateAutoDeposit(row: Record<string, unknown>): string | null {
  return !isValidMonth(row.month) || !isFiniteNumber(row.amount) || row.amount < 0 || !optionalString(row, "description") ? "auto deposit fields invalid" : null;
}

function validateTransaction(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || (row.type !== "deposit" && row.type !== "purchase") || !requiredString(row, "description") || !isFiniteNumber(row.amount)) return "transaction fields invalid";
  if (row.amount < 0) return "transaction.amount must be non-negative";
  if (!isValidDate(row.date) && !isValidMonth(row.date)) return "transaction.date invalid";
  return null;
}

function validateNote(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "title") || !requiredString(row, "content") || !optionalString(row, "plain_text")) return "note text fields invalid";
  if (
    !isBinaryFlag(row.is_pinned) ||
    typeof row.color !== "string" ||
    !Object.prototype.hasOwnProperty.call(NOTE_COLORS, row.color)
  ) {
    return "note fields invalid";
  }
  if (row.kind !== undefined && row.kind !== "text" && row.kind !== "checklist") return "note.kind invalid";
  if (row.is_archived !== undefined && !isBinaryFlag(row.is_archived)) return "note.is_archived invalid";
  if (!requiredString(row, "created_at") || !requiredString(row, "updated_at")) return "note dates invalid";
  return null;
}

function validateNoteItem(row: Record<string, unknown>): string | null {
  if (!optionalId(row) || !requiredString(row, "text")) return "note item fields invalid";
  if (!isInteger(row.note_id) || (row.note_id as number) <= 0) return "note item note_id invalid";
  if (!isBinaryFlag(row.checked)) return "note item checked invalid";
  if (!isInteger(row.position) || (row.position as number) < 0) return "note item position invalid";
  return null;
}

function isTaskTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:[0-5]\d$/.test(value) &&
    isTaskDate(value.slice(0, 10)) && isTaskTime(value.slice(11, 16));
}

function validateTaskTables(tables: Record<string, unknown>, version: number): string | null {
  if (tables.tasks === undefined && tables.taskLists === undefined && version < 5) return null;
  if (!Array.isArray(tables.tasks) || !Array.isArray(tables.taskLists)) return "Task tables must be arrays";
  const listIds = new Set<number>();
  for (const row of tables.taskLists) {
    if (!isObject(row) || !isInteger(row.id) || row.id <= 0 || listIds.has(row.id) ||
        typeof row.name !== "string" || !row.name.trim() || row.name.length > 80) return "Invalid task list";
    listIds.add(row.id);
  }
  const tasks = new Map<number, Record<string, unknown>>();
  for (const row of tables.tasks) {
    if (!isObject(row) || !isTaskInput(row) || (row.priority !== 0 && row.priority !== 1 && row.priority !== 2) || !isInteger(row.id) || row.id <= 0 || tasks.has(row.id) ||
        !isTaskTimestamp(row.created_at) || !isTaskTimestamp(row.updated_at) ||
        (row.completed_at !== null && !isTaskTimestamp(row.completed_at)) ||
        (row.list_id !== null && (!isInteger(row.list_id) || !listIds.has(row.list_id))) ||
        (row.parent_id !== null && (!isInteger(row.parent_id) || row.parent_id <= 0)) ||
        ((row.repeat === "monthly" || row.repeat === "yearly") ? !isInteger(row.repeat_day) || row.repeat_day < 1 || row.repeat_day > 31 : row.repeat_day !== null)) return "Invalid task";
    tasks.set(row.id, row);
  }
  const parents = new Set<number>();
  for (const row of tasks.values()) {
    if (row.parent_id === null) continue;
    const parentId = row.parent_id as number;
    const parent = tasks.get(parentId);
    if (!parent || parent.completed_at === null || parent.repeat === "none" || parents.has(parentId)) return "Invalid recurring task reference";
    parents.add(parentId);
  }
  // A later occurrence can be freely rescheduled or made undated. Validate
  // graph cycles directly instead of imposing chronology on edited tasks.
  const checked = new Set<number>();
  for (const id of tasks.keys()) {
    const path = new Set<number>();
    let current: number | null = id;
    while (current !== null && !checked.has(current)) {
      if (path.has(current)) return "Cyclic recurring task reference";
      path.add(current);
      const parent: unknown = tasks.get(current)?.parent_id;
      current = typeof parent === "number" ? parent : null;
    }
    for (const visited of path) checked.add(visited);
  }
  return null;
}

export function validateEnvelope(raw: unknown): { ok: true; data: BackupEnvelope } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: "Root must be object" };
  const meta = raw.meta as Record<string, unknown> | undefined;
  if (!isObject(meta)) return { ok: false, error: "Missing meta" };
  if (meta.format !== BACKUP_FORMAT) return { ok: false, error: `Invalid format ${String(meta.format)}` };
  if (meta.version !== 1 && meta.version !== 2 && meta.version !== 3 && meta.version !== 4 && meta.version !== 5 && meta.version !== 6 && meta.version !== BACKUP_VERSION) return { ok: false, error: `Unsupported version ${String(meta.version)}` };
  const tables = raw.tables as Record<string, unknown> | undefined;
  if (!isObject(tables)) return { ok: false, error: "Missing tables" };
  const taskError = validateTaskTables(tables, meta.version);
  if (taskError) return { ok: false, error: taskError };

  const requiredArrays = ["budgets", "expenses", "recurringExpenses", "autoDeposits", "transactions", "notes"] as const;
  for (const k of requiredArrays) {
    if (!Array.isArray(tables[k])) return { ok: false, error: `tables.${k} must be array` };
  }

  // Optional singletons can be null or object
  if (tables.loans !== null && tables.loans !== undefined && (!isObject(tables.loans) || validateLoans(tables.loans))) return { ok: false, error: "tables.loans invalid" };
  if (tables.savingsGoal !== null && tables.savingsGoal !== undefined && (!isObject(tables.savingsGoal) || validateSavingsGoal(tables.savingsGoal))) return { ok: false, error: "tables.savingsGoal invalid" };

  const validators = { budgets: validateBudget, expenses: validateExpense, recurringExpenses: validateRecurringExpense, autoDeposits: validateAutoDeposit, transactions: validateTransaction, notes: validateNote } as const;
  for (const key of requiredArrays) {
    const rows = tables[key];
    if (!Array.isArray(rows)) return { ok: false, error: `tables.${key} must be array` };
    for (const [index, value] of rows.entries()) {
      if (!isObject(value)) return { ok: false, error: `tables.${key}[${index}] must be object` };
      if (key === "budgets" && meta.version >= 7 && value.savings_goal === undefined) return { ok: false, error: `tables.budgets[${index}]: missing savings_goal` };
      const error = validators[key](value);
      if (error) return { ok: false, error: `tables.${key}[${index}]: ${error}` };
    }
  }

  const budgets = tables.budgets as Record<string, unknown>[];
  const budgetMonths = new Set<string>();
  const budgetIds = new Set<number>();
  const budgetMonthById = new Map<number, string>();
  for (const budget of budgets) {
    budgetMonths.add(budget.month as string);
    if (budget.id !== undefined) {
      const id = budget.id as number;
      if (budgetIds.has(id)) return { ok: false, error: "Duplicate budget ID" };
      budgetIds.add(id);
      budgetMonthById.set(id, budget.month as string);
    }
  }
  if (budgetMonths.size !== budgets.length) return { ok: false, error: "Duplicate budget month" };
  for (const expense of tables.expenses as Record<string, unknown>[]) {
    const hasMonth = expense.budget_month !== undefined && budgetMonths.has(expense.budget_month as string);
    const hasId = expense.budget_id !== undefined && budgetIds.has(expense.budget_id as number);
    if (!hasMonth && !hasId) return { ok: false, error: "Expense references a missing budget" };
    if (expense.budget_month !== undefined && expense.budget_id !== undefined &&
      budgetMonthById.get(expense.budget_id as number) !== expense.budget_month) {
      return { ok: false, error: "Expense budget references disagree" };
    }
  }
  const autoDepositMonths = (tables.autoDeposits as Record<string, unknown>[]).map((row) => row.month as string);
  if (new Set(autoDepositMonths).size !== autoDepositMonths.length) return { ok: false, error: "Duplicate auto deposit month" };

  // Optional checklist items (absent in backups written before v5).
  const noteItems = tables.noteItems;
  if (meta.version >= 4 && (noteItems === undefined || (tables.notes as Record<string, unknown>[]).some((note) => note.is_archived === undefined))) {
    return { ok: false, error: "Missing note archive or checklist fields" };
  }
  if (noteItems !== undefined) {
    if (!Array.isArray(noteItems)) return { ok: false, error: "tables.noteItems must be array" };
    const noteIds = new Set<number>();
    for (const note of tables.notes as Record<string, unknown>[]) {
      if (note.id !== undefined) noteIds.add(note.id as number);
    }
    for (const [index, value] of noteItems.entries()) {
      if (!isObject(value)) return { ok: false, error: `tables.noteItems[${index}] must be object` };
      const error = validateNoteItem(value);
      if (error) return { ok: false, error: `tables.noteItems[${index}]: ${error}` };
      if (!noteIds.has(value.note_id as number)) return { ok: false, error: "note item references a missing note" };
    }
  }
  const notesWithIds = (tables.notes as Record<string, unknown>[]).filter((note) => note.id !== undefined);
  if (new Set(notesWithIds.map((note) => note.id as number)).size !== notesWithIds.length) {
    return { ok: false, error: "Duplicate note ID" };
  }

  const repaymentPlans = tables.repaymentPlans ?? [];
  const repaymentPayments = tables.repaymentPayments ?? [];
  if (meta.version >= 2 && (tables.repaymentPlans === undefined || tables.repaymentPayments === undefined)) return { ok: false, error: "Missing repayment tables" };
  if (!Array.isArray(repaymentPlans) || !Array.isArray(repaymentPayments)) return { ok: false, error: "Repayment tables must be arrays" };
  const planIds = new Set<number>();
  const plansById = new Map<number, RepaymentPlan>();
  for (const row of repaymentPlans) {
    if (!isObject(row) || !isInteger(row.id) || row.id <= 0 || planIds.has(row.id)) return { ok: false, error: "Invalid or duplicate repayment plan ID" };
    const plan: RepaymentInput = {
      kind: row.kind === "loan" || row.kind === "card" ? row.kind : "loan",
      name: row.name as string,
      amount: row.amount as number,
      apr: row.apr as number,
      payment: row.payment as number,
      term: row.term as number,
      monthsPaid: row.months_paid as number,
      startMonth: row.start_month as string,
      endMonth: typeof row.end_month === "string" ? row.end_month : null,
      unbounded: row.unbounded === 1,
    };
    if ((row.end_month !== undefined && row.end_month !== null && typeof row.end_month !== "string") || (row.unbounded !== undefined && !isBinaryFlag(row.unbounded))) return { ok: false, error: "Invalid repayment schedule" };
    if (meta.version >= 3 && (row.end_month === undefined || row.unbounded === undefined)) return { ok: false, error: "Missing repayment schedule fields" };
    if (row.kind !== "loan" && row.kind !== "card" || !isValidRepaymentInput(plan)) return { ok: false, error: "Invalid repayment plan" };
    planIds.add(row.id);
    plansById.set(row.id, { id: row.id, ...plan });
  }
  const paymentKeys = new Set<string>();
  const countedByPlan = new Map<number, number>();
  for (const row of repaymentPayments) {
    if (!isObject(row) || !isInteger(row.plan_id) || !planIds.has(row.plan_id) || !isValidMonth(row.month) || !isBinaryFlag(row.counted)) return { ok: false, error: "Invalid repayment payment" };
    const plan = plansById.get(row.plan_id);
    if (!plan || repaymentForMonth(plan, row.month as string) <= 0 || !budgetMonths.has(row.month as string)) return { ok: false, error: "Repayment payment is outside its schedule or budget" };
    const key = `${row.plan_id}:${row.month}`;
    if (paymentKeys.has(key)) return { ok: false, error: "Duplicate repayment payment" };
    paymentKeys.add(key);
    countedByPlan.set(row.plan_id, (countedByPlan.get(row.plan_id) ?? 0) + row.counted);
  }
  for (const [id, counted] of countedByPlan) {
    if (counted > (plansById.get(id)?.monthsPaid ?? 0)) return { ok: false, error: "Repayment counter is inconsistent" };
  }

  // Detect accidental .db file pick: JSON parse would have thrown already, but guard SQLite header if base64
  // Real SQLite header check is done on file read before JSON parse (see import flow).

  // Older mixed backups can still restore the hub. Discard retired or unknown
  // tables so they never reach the hub's import or recovery flows.
  const hubTables = Object.fromEntries(
    [...requiredArrays, "loans", "savingsGoal", "noteItems", "repaymentPlans", "repaymentPayments", "taskLists", "tasks"]
      .filter(key => Object.prototype.hasOwnProperty.call(tables, key))
      .map(key => [key, tables[key]])
  );
  return { ok: true, data: { ...raw, tables: hubTables } as unknown as BackupEnvelope };
}
