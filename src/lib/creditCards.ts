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
}

export function creditCardDetails(loans: Loans, slot: CreditCardSlot): CreditCardDetails {
  return slot === 1
    ? { name: loans.cc_name, balance: loans.cc_balance, apr: loans.cc_apr, payment: loans.cc_payment, monthsPaid: loans.cc_months_paid, startMonth: loans.cc_start_month, endMonth: loans.cc_end_month }
    : { name: loans.cc2_name, balance: loans.cc2_balance, apr: loans.cc2_apr, payment: loans.cc2_payment, monthsPaid: loans.cc2_months_paid, startMonth: loans.cc2_start_month, endMonth: loans.cc2_end_month };
}

export function creditCardFields(slot: CreditCardSlot, card: CreditCardDetails): Partial<Loans> {
  return slot === 1
    ? { cc_name: card.name, cc_balance: card.balance, cc_apr: card.apr, cc_payment: card.payment, cc_months_paid: card.monthsPaid, cc_start_month: card.startMonth, cc_end_month: card.endMonth }
    : { cc2_name: card.name, cc2_balance: card.balance, cc2_apr: card.apr, cc2_payment: card.payment, cc2_months_paid: card.monthsPaid, cc2_start_month: card.startMonth, cc2_end_month: card.endMonth };
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

export function isCreditCardValid(card: CreditCardDetails): boolean {
  return typeof card.name === "string" &&
    [card.balance, card.payment].every((value) => Number.isFinite(value) && value >= 0 && value <= MAX_LOAN_AMOUNT) &&
    Number.isFinite(card.apr) && card.apr >= 0 &&
    Number.isSafeInteger(card.monthsPaid) && card.monthsPaid >= 0 && card.monthsPaid <= MAX_LOAN_TERM_MONTHS &&
    isCreditCardScheduleValid(card);
}

/** Both boundary months are included; null boundaries leave that end open. */
export function isCreditCardActive(card: CreditCardDetails, month: string): boolean {
  return hasCreditCard(card) && isCreditCardMonth(month) && isCreditCardScheduleValid(card) &&
    (!card.startMonth || month >= card.startMonth) && (!card.endMonth || month <= card.endMonth);
}

export function creditCardPaymentForMonth(card: CreditCardDetails, month: string): number {
  return isCreditCardActive(card, month) ? card.payment : 0;
}
