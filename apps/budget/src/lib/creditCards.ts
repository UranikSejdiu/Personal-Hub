import type { Loans } from "../types/budget";
import { MAX_LOAN_AMOUNT, MAX_LOAN_TERM_MONTHS } from "./calculations";

export type CreditCardSlot = 1 | 2;
export const CREDIT_CARD_SLOTS: readonly CreditCardSlot[] = [1, 2];

export interface CreditCardDetails {
  name: string;
  balance: number;
  apr: number;
  payment: number;
  monthsPaid: number;
  startMonth: string | null;
  endMonth: string | null;
  planMode: "installment" | null;
  installments: number;
}

export function creditCardDetails(loans: Loans, slot: CreditCardSlot): CreditCardDetails {
  return slot === 1
    ? { name: loans.cc_name, balance: loans.cc_balance, apr: loans.cc_apr, payment: loans.cc_payment, monthsPaid: loans.cc_months_paid, startMonth: loans.cc_start_month, endMonth: loans.cc_end_month, planMode: loans.cc_plan_mode, installments: loans.cc_installments }
    : { name: loans.cc2_name, balance: loans.cc2_balance, apr: loans.cc2_apr, payment: loans.cc2_payment, monthsPaid: loans.cc2_months_paid, startMonth: loans.cc2_start_month, endMonth: loans.cc2_end_month, planMode: loans.cc2_plan_mode, installments: loans.cc2_installments };
}

export function creditCardFields(slot: CreditCardSlot, card: CreditCardDetails): Partial<Loans> {
  return slot === 1
    ? { cc_name: card.name, cc_balance: card.balance, cc_apr: card.apr, cc_payment: card.payment, cc_months_paid: card.monthsPaid, cc_start_month: card.startMonth, cc_end_month: card.endMonth, cc_plan_mode: card.planMode, cc_installments: card.installments }
    : { cc2_name: card.name, cc2_balance: card.balance, cc2_apr: card.apr, cc2_payment: card.payment, cc2_months_paid: card.monthsPaid, cc2_start_month: card.startMonth, cc2_end_month: card.endMonth, cc2_plan_mode: card.planMode, cc2_installments: card.installments };
}

export function hasCreditCard(card: CreditCardDetails): boolean {
  return card.balance > 0 || card.payment > 0;
}

export function isCreditCardMonth(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function isCreditCardScheduleValid(card: Pick<CreditCardDetails, "startMonth" | "endMonth">): boolean {
  return (card.startMonth === null || isCreditCardMonth(card.startMonth)) &&
    (card.endMonth === null || isCreditCardMonth(card.endMonth)) &&
    (!card.startMonth || !card.endMonth || card.startMonth <= card.endMonth);
}

/** A bounded schedule includes a payment in both the first and last month. */
export function creditCardScheduledMonths(card: Pick<CreditCardDetails, "startMonth" | "endMonth">): number | null {
  if (!card.startMonth || !card.endMonth || !isCreditCardScheduleValid(card)) return null;
  const [startYear, startMonth] = card.startMonth.split("-").map(Number);
  const [endYear, endMonth] = card.endMonth.split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

export function installmentEndMonth(startMonth: string, installments: number): string | null {
  if (!isCreditCardMonth(startMonth) || !Number.isSafeInteger(installments) || installments < 1 || installments > MAX_LOAN_TERM_MONTHS) return null;
  const [year, month] = startMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month + installments - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Fixed installment plans use cents so the final payment closes the total exactly. */
export function installmentPayments(card: Pick<CreditCardDetails, "balance" | "installments">): { regular: number; final: number; total: number } | null {
  if (!Number.isFinite(card.balance) || card.balance <= 0 || card.balance > MAX_LOAN_AMOUNT ||
      !Number.isSafeInteger(card.installments) || card.installments < 1 || card.installments > MAX_LOAN_TERM_MONTHS) return null;
  const totalCents = Math.round(card.balance * 100);
  const regularCents = Math.floor(totalCents / card.installments);
  if (regularCents < 1) return null;
  return { regular: regularCents / 100, final: (totalCents - regularCents * (card.installments - 1)) / 100, total: totalCents / 100 };
}

export function isCreditCardValid(card: CreditCardDetails): boolean {
  const commonValid = typeof card.name === "string" &&
    [card.balance, card.payment].every((value) => Number.isFinite(value) && value >= 0 && value <= MAX_LOAN_AMOUNT) &&
    Number.isFinite(card.apr) && card.apr >= 0 &&
    Number.isSafeInteger(card.monthsPaid) && card.monthsPaid >= 0 && card.monthsPaid <= MAX_LOAN_TERM_MONTHS &&
    isCreditCardScheduleValid(card);
  if (!commonValid) return false;
  if (card.planMode === null) return card.installments === 0;
  if (card.planMode !== "installment") return false;
  const amounts = installmentPayments(card);
  return amounts !== null && card.apr === 0 && card.monthsPaid <= card.installments &&
    card.startMonth !== null && card.endMonth === installmentEndMonth(card.startMonth, card.installments) &&
    Math.round(card.payment * 100) === Math.round(amounts.regular * 100);
}

/** Both boundary months are included; null boundaries leave that end open. */
export function isCreditCardActive(card: CreditCardDetails, month: string): boolean {
  return hasCreditCard(card) && isCreditCardMonth(month) && isCreditCardScheduleValid(card) &&
    (!card.startMonth || month >= card.startMonth) && (!card.endMonth || month <= card.endMonth);
}

export function creditCardPaymentForMonth(card: CreditCardDetails, month: string): number {
  if (!isCreditCardActive(card, month)) return 0;
  if (card.planMode === "installment") {
    const amounts = installmentPayments(card);
    return amounts ? month === card.endMonth ? amounts.final : amounts.regular : 0;
  }
  return card.payment;
}
