import { isTaskDate, taskDateKey } from "./taskDates";

export function localTaskDate(key: string): Date {
  if (!isTaskDate(key)) throw new Error("Invalid calendar date");
  return new Date(`${key}T12:00:00`);
}

export function calendarDays(month: string, selected: string, week: boolean): string[] {
  const start = localTaskDate(week ? selected : month);
  if (!week) start.setDate(1);
  const offset = (start.getDay() + 6) % 7;
  const count = week ? 7 : Math.ceil((offset + new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()) / 7) * 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start); date.setDate(date.getDate() + index); return taskDateKey(date);
  });
}

export function moveCalendarDate(key: string, amount: number, week: boolean): string {
  const date = localTaskDate(key);
  if (week) date.setDate(date.getDate() + amount * 7);
  else { date.setDate(1); date.setMonth(date.getMonth() + amount); }
  return date.getFullYear() < 1000 || date.getFullYear() > 9999 ? key : taskDateKey(date);
}
