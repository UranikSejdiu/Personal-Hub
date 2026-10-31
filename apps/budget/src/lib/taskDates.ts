import type { TaskInput, TaskRepeat } from "../types/tasks";

/** Calendar dates are local dates, never UTC timestamps. */
export function taskDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && date.getFullYear() >= 1000 && taskDateKey(date) === value;
}

export function isTaskTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isTaskInput(value: unknown): value is TaskInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.title === "string" && input.title.trim().length > 0 && input.title.length <= 200 &&
    typeof input.notes === "string" && input.notes.length <= 10000 &&
    (input.list_id === null || (typeof input.list_id === "number" && Number.isSafeInteger(input.list_id) && input.list_id > 0)) &&
    (input.due_date === null || isTaskDate(input.due_date)) &&
    (input.priority === 0 || input.priority === 1 || input.priority === 2) &&
    (input.repeat === "none" || input.repeat === "daily" || input.repeat === "weekly" || input.repeat === "monthly" || input.repeat === "yearly") &&
    (input.repeat === "none" || input.due_date !== null) &&
    (input.reminder_time === null || (isTaskTime(input.reminder_time) && input.due_date !== null));
}

export function formatTaskDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Keep the original schedule; skip missed occurrences after a late completion. */
export function nextTaskDate(due: string, repeat: Exclude<TaskRepeat, "none">, anchorDay: number, today = taskDateKey()): string {
  if (!isTaskDate(due) || !isTaskDate(today) || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new Error("Invalid task schedule");
  const date = new Date(`${due}T12:00:00`);
  do {
    if (repeat === "monthly") {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      date.setDate(1);
      date.setMonth(month);
      date.setDate(Math.min(anchorDay, new Date(year, month + 1, 0).getDate()));
    } else if (repeat === "yearly") {
      const year = date.getFullYear() + 1;
      const month = date.getMonth();
      date.setDate(1);
      date.setFullYear(year);
      date.setDate(Math.min(anchorDay, new Date(year, month + 1, 0).getDate()));
    } else {
      date.setDate(date.getDate() + (repeat === "daily" ? 1 : 7));
    }
    if (date.getFullYear() > 9999) throw new Error("Task schedule exceeds supported dates");
  } while (taskDateKey(date) <= today);
  return taskDateKey(date);
}
