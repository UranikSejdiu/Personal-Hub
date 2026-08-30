export function pmt(
  principal: number,
  annualRate: number,
  months: number
): number {
  if (months === 0) return 0;
  if (annualRate === 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (
    (principal * r * Math.pow(1 + r, months)) /
    (Math.pow(1 + r, months) - 1)
  );
}

export function remainingBalance(
  principal: number,
  annualRate: number,
  totalMonths: number,
  paidMonths: number
): number {
  if (totalMonths <= 0) return 0;
  if (paidMonths >= totalMonths) return 0;
  if (annualRate === 0) {
    return principal - (principal / totalMonths) * paidMonths;
  }
  const r = annualRate / 100 / 12;
  const payment = pmt(principal, annualRate, totalMonths);
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
  if (termMonths <= 0 || principal <= 0) return [];
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
  if (balance <= 0) return { months: 0, totalInterest: 0 };
  if (monthlyPayment <= 0)
    return { months: Infinity, totalInterest: Infinity };

  if (annualApr === 0) {
    return {
      months: Math.ceil(balance / monthlyPayment),
      totalInterest: 0,
    };
  }

  const monthlyRate = annualApr / 100 / 12;

  if (monthlyPayment <= balance * monthlyRate) {
    return { months: Infinity, totalInterest: Infinity };
  }

  let remaining = balance;
  let months = 0;
  let interest = 0;

  while (remaining > 0 && months < 600) {
    const monthInterest = remaining * monthlyRate;
    interest += monthInterest;
    remaining = remaining + monthInterest - monthlyPayment;
    months++;
    if (remaining <= 0) break;
  }

  return { months, totalInterest: interest };
}
