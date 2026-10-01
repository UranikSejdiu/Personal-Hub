export interface Loans {
  loan_amount: number;
  loan_rate: number;
  loan_term: number;
  loan_payment: number;
  loan_start_date: string | null;
  loan_payment_day: number;
  loan_months_paid: number;
  loan_name: string;
  loan_schedule_mode: "count" | "dates" | null;
  loan_start_month: string | null;
  loan_end_month: string | null;
  cc_balance: number;
  cc_apr: number;
  cc_payment: number;
  cc_months_paid: number;
  cc_name: string;
  cc_start_month: string | null;
  cc_end_month: string | null;
  cc_plan_mode: "installment" | null;
  cc_installments: number;
  cc2_balance: number;
  cc2_apr: number;
  cc2_payment: number;
  cc2_months_paid: number;
  cc2_name: string;
  cc2_start_month: string | null;
  cc2_end_month: string | null;
  cc2_plan_mode: "installment" | null;
  cc2_installments: number;
}

export interface Budget {
  id: number;
  month: string;
  income: number;
  loan_paid: boolean;
  cc_paid: boolean;
  cc2_paid: boolean;
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
  loan_name: "",
  loan_schedule_mode: null,
  loan_start_month: null,
  loan_end_month: null,
  cc_balance: 0,
  cc_apr: 0,
  cc_payment: 0,
  cc_months_paid: 0,
  cc_name: "",
  cc_start_month: null,
  cc_end_month: null,
  cc_plan_mode: null,
  cc_installments: 0,
  cc2_balance: 0,
  cc2_apr: 0,
  cc2_payment: 0,
  cc2_months_paid: 0,
  cc2_name: "",
  cc2_start_month: null,
  cc2_end_month: null,
  cc2_plan_mode: null,
  cc2_installments: 0,
};
