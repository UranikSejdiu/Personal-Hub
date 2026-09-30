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

export function remainingBalance(
  principal: number,
  annualRate: number,
  totalMonths: number,
  paidMonths: number,
  regularPayment?: number
): number {
  if (
    !Number.isFinite(principal) ||
    !Number.isFinite(annualRate) ||
    !Number.isFinite(totalMonths) ||
    !Number.isFinite(paidMonths)
  ) {
    return 0;
  }
  if (principal <= 0 || principal > MAX_LOAN_AMOUNT || !Number.isSafeInteger(totalMonths) ||
      totalMonths <= 0 || totalMonths > MAX_LOAN_TERM_MONTHS || annualRate > MAX_LOAN_ANNUAL_RATE) return 0;
  if (paidMonths >= totalMonths) return 0;
  const rate = annualRate > 0 ? annualRate : 0;
  if (regularPayment !== undefined && Number.isFinite(regularPayment) && regularPayment > 0) {
    let balance = principal;
    const monthlyRate = rate / 100 / 12;
    for (let month = 0; month < Math.min(paidMonths, totalMonths); month++) {
      balance = balance * (1 + monthlyRate) - regularPayment;
      if (balance <= 0) return 0;
      if (!Number.isFinite(balance)) return Number.MAX_VALUE;
    }
    return balance < Number.MAX_VALUE / 100 ? Math.round(balance * 100) / 100 : balance;
  }
  if (rate === 0) {
    return Math.max(0, principal - (principal / totalMonths) * paidMonths);
  }
  const r = rate / 100 / 12;
  const payment = pmt(principal, rate, totalMonths);
  const balance =
    (payment / r) * (1 - 1 / Math.pow(1 + r, totalMonths - paidMonths));
  return Math.max(0, Math.round(balance * 100) / 100);
}

export interface ScheduleRow {
  index: number;
  paymentDate: string;
  days: number;
  payment: number;
  capital: number;
  interest: number;
  balance: number;
}

export function getActualSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDateStr: string,
  paymentDay: number,
  regularPayment?: number
): ScheduleRow[] {
  if (!Number.isSafeInteger(termMonths) || termMonths <= 0 ||
      termMonths > MAX_LOAN_TERM_MONTHS || principal <= 0 || principal > MAX_LOAN_AMOUNT ||
      !Number.isFinite(annualRate) || annualRate < 0 ||
      annualRate > MAX_LOAN_ANNUAL_RATE ||
      (regularPayment !== undefined && (!Number.isFinite(regularPayment) || regularPayment > MAX_LOAN_AMOUNT))) return [];
  if (!startDateStr || startDateStr.length === 0) return [];
  const rate = annualRate / 100;
  const schedule: ScheduleRow[] = [];
  const pmtVal =
    regularPayment && regularPayment > 0
      ? regularPayment
      : pmt(principal, annualRate, termMonths);
  const parts = startDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return [];
  const [y, m, d] = parts;
  let balance = principal;
  let prevYear = y,
    prevMonth = m,
    prevDay = d;

  for (let i = 1; i <= termMonths; i++) {
    let nextMonth = prevMonth + 1;
    let nextYear = prevYear;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const nextDay = Math.min(paymentDay, lastDay);
    const paymentDate = new Date(
      Date.UTC(nextYear, nextMonth - 1, nextDay)
    );

    const prevDate = new Date(Date.UTC(prevYear, prevMonth - 1, prevDay));
    const diffMs = paymentDate.getTime() - prevDate.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const interest = balance * (rate / 365) * days;
    const isLast = i === termMonths;

    let capital: number;
    let payment: number;
    if (isLast) {
      capital = balance;
      payment = capital + interest;
    } else {
      payment = pmtVal;
      capital = payment - interest;
      if (capital > balance) {
        capital = balance;
        payment = capital + interest;
      }
    }

    balance -= capital;
    if (balance < 0.005) balance = 0;

    const dateStr = paymentDate.toISOString().slice(0, 10);

    schedule.push({
      index: i,
      paymentDate: dateStr,
      days,
      payment: Math.round(payment * 100) / 100,
      capital: Math.round(capital * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    });

    prevYear = nextYear;
    prevMonth = nextMonth;
    prevDay = nextDay;
  }

  return schedule;
}

export function scheduleBalance(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDateStr: string,
  paymentDay: number,
  paidMonths: number,
  regularPayment?: number
): {
  balance: number;
  payment: number;
  progressPct: number;
  remainingMonths: number;
  totalInterest: number;
  schedule: ScheduleRow[];
} {
  const schedule = getActualSchedule(
    principal,
    annualRate,
    termMonths,
    startDateStr,
    paymentDay,
    regularPayment
  );
  if (schedule.length === 0) {
    return {
      balance: 0,
      payment: 0,
      progressPct: 0,
      remainingMonths: 0,
      totalInterest: 0,
      schedule: [],
    };
  }

  let balance: number;
  let payment: number;
  if (paidMonths <= 0) {
    balance = principal;
    payment = schedule[0].payment;
  } else if (paidMonths >= termMonths) {
    balance = 0;
    payment = schedule[schedule.length - 1].payment;
  } else {
    const idx = Math.min(paidMonths, schedule.length) - 1;
    balance = schedule[idx].balance;
    payment = schedule[idx].payment;
  }

  const progressPct =
    termMonths > 0
      ? Math.min(100, Math.round((paidMonths / termMonths) * 100))
      : 0;
  const remainingMonths = Math.max(0, termMonths - paidMonths);
  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0);

  return {
    balance,
    payment,
    progressPct,
    remainingMonths,
    totalInterest,
    schedule,
  };
}

export function creditCardPayoff(
  balance: number,
  annualApr: number,
  monthlyPayment: number
): { months: number; totalInterest: number } {
  if (!Number.isFinite(balance) || !Number.isFinite(annualApr) || !Number.isFinite(monthlyPayment)) {
    return { months: Infinity, totalInterest: Infinity };
  }
  if (balance <= 0) return { months: 0, totalInterest: 0 };
  if (monthlyPayment <= 0)
    return { months: Infinity, totalInterest: Infinity };

  if (annualApr <= 0) {
    return {
      months: Math.ceil(balance / monthlyPayment),
      totalInterest: 0,
    };
  }

  const monthlyRate = annualApr / 100 / 12;

  if (monthlyPayment <= balance * monthlyRate) {
    return { months: Infinity, totalInterest: Infinity };
  }

  // Closed form: months = -ln(1 - r·B/P) / ln(1 + r). The previous 600-iteration
  // cap mislabelled long-but-payable debts as "Never"; this is exact and O(1).
  // The genuinely never-payable case (payment <= interest) is handled above.
  const months = Math.ceil(
    Math.log(monthlyPayment / (monthlyPayment - balance * monthlyRate)) /
      Math.log(1 + monthlyRate)
  );
  const paidMonths = Math.max(0, months - 1);
  const growth = Math.pow(1 + monthlyRate, paidMonths);
  const balanceAfter = balance * growth - (monthlyPayment * (growth - 1)) / monthlyRate;
  const finalPayment = Math.max(0, balanceAfter * (1 + monthlyRate));
  const totalInterest = Math.max(
    0,
    paidMonths * monthlyPayment + finalPayment - balance
  );
  return { months, totalInterest: Math.round(totalInterest * 100) / 100 };
}
