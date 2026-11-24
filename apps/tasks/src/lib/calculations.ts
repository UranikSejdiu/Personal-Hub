export const MAX_LOAN_TERM_MONTHS = 1200;
export const MAX_LOAN_ANNUAL_RATE = 100;
export const MAX_LOAN_AMOUNT = 1_000_000_000_000;

export function pmt(
  principal: number,
  annualRate: number,
  months: number
): number {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || !Number.isFinite(months)) {
    return 0;
  }
  if (principal <= 0 || principal > MAX_LOAN_AMOUNT || !Number.isSafeInteger(months) || months <= 0 ||
      months > MAX_LOAN_TERM_MONTHS || annualRate > MAX_LOAN_ANNUAL_RATE) return 0;
  if (annualRate <= 0) return principal / months;
  const r = annualRate / 100 / 12;
  const denominator = -Math.expm1(-months * Math.log1p(r));
  return (principal * r) / denominator;
}
