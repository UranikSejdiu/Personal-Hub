export interface Loans {
  loan_amount: number;
  loan_rate: number;
  loan_term: number;
  loan_payment: number;
  loan_start_date: string | null;
  loan_payment_day: number;
  loan_months_paid: number;
  cc_balance: number;
  cc_apr: number;
  cc_payment: number;
  cc_months_paid: number;
}

export interface Budget {
  id: number;
  month: string;
  income: number;
  loan_paid: boolean;
  cc_paid: boolean;
  updated_at: string;
}

export interface Expense {
  id: number;
  budget_id: number;
  category: string;
  amount: number;
  paid: boolean;
  is_recurring: boolean;
}

export interface SavingsGoal {
  goal_amount: number;
  salary: number;
}

export interface RecurringExpense {
  id: number;
  category: string;
  amount: number;
}

export interface MonthSummary {
  month: string;
  income: number;
  outflow: number;
  remaining: number;
  actualOutflow: number;
  actualRemaining: number;
  savingsGoal: number;
  goalProgress: number;
  goalMet: boolean;
}

export const EMPTY_LOANS: Loans = {
  loan_amount: 0,
  loan_rate: 0,
  loan_term: 0,
  loan_payment: 0,
  loan_start_date: null,
  loan_payment_day: 1,
  loan_months_paid: 0,
  cc_balance: 0,
  cc_apr: 0,
  cc_payment: 0,
  cc_months_paid: 0,
};
