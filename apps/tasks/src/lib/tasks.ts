import * as db from "./db";
import { isTaskDate, isTaskInput, nextTaskDate, taskDateKey } from "./taskDates";
import { notifyTaskChanges } from "./taskEvents";
import type { Task, TaskInput } from "../types/tasks";

export type TaskFilter = "all" | "active" | "today" | "upcoming" | "overdue" | "undated" | "completed";
export interface TaskPageOptions {
  filter: TaskFilter;
  today: string;
  search?: string;
  offset?: number;
  limit?: number;
  date?: string;
}

export async function loadTaskCounts(): Promise<{ open: number; total: number }> {
  const counts = await db.get<{ open: number; total: number }>(
    "SELECT COUNT(*) AS total, COUNT(CASE WHEN completed_at IS NULL THEN 1 END) AS open FROM tasks"
  );
  return counts ?? { open: 0, total: 0 };
}

export async function loadTask(id: number): Promise<Task | undefined> {
  return db.get<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
}

/** Filter before pagination so every page contains only matching tasks. */
export async function loadTasksPage({ filter, today, search = "", offset = 0, limit = 40, date }: TaskPageOptions) {
  if (!isTaskDate(today) ||
      !["all", "active", "today", "upcoming", "overdue", "undated", "completed"].includes(filter) ||
      (date !== undefined && !isTaskDate(date)) ||
      !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid task page");
  const where = [filter === "all" ? "1 = 1" : filter === "completed" ? "completed_at IS NOT NULL" : "completed_at IS NULL"];
  const values: (string | number)[] = [];
  if (filter === "today" || filter === "upcoming" || filter === "overdue") {
    where.push(`due_date ${filter === "today" ? "<=" : filter === "overdue" ? "<" : ">"} ?`);
    values.push(today);
  } else if (filter === "undated") where.push("due_date IS NULL");
  if (date !== undefined) { where.push("due_date = ?"); values.push(date); }
  if (search.trim()) {
    where.push("(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')");
    const pattern = `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    values.push(pattern, pattern);
  }
  const rows = await db.query<Task>(`SELECT * FROM tasks WHERE ${where.join(" AND ")}
    ORDER BY completed_at IS NOT NULL, due_date IS NULL, due_date, reminder_time IS NULL, reminder_time, id DESC LIMIT ? OFFSET ?`, [...values, limit + 1, offset]);
  const tasks = rows.slice(0, limit);
  return { tasks, hasMore: rows.length > limit, nextOffset: offset + tasks.length };
}

export interface TaskOverview { today: number; upcoming: number; overdue: number; completed: number; open: number }
export async function loadTaskOverview(today = taskDateKey()): Promise<TaskOverview> {
  if (!isTaskDate(today)) throw new Error("Invalid overview date");
  return await db.get<TaskOverview>(`SELECT
    COUNT(CASE WHEN completed_at IS NULL AND due_date = ? THEN 1 END) AS today,
    COUNT(CASE WHEN completed_at IS NULL AND due_date > ? THEN 1 END) AS upcoming,
    COUNT(CASE WHEN completed_at IS NULL AND due_date < ? THEN 1 END) AS overdue,
    COUNT(completed_at) AS completed, COUNT(CASE WHEN completed_at IS NULL THEN 1 END) AS open FROM tasks`, [today, today, today])
    ?? { today: 0, upcoming: 0, overdue: 0, completed: 0, open: 0 };
}

export async function loadTaskDayCounts(start: string, end: string): Promise<Record<string, number>> {
  if (!isTaskDate(start) || !isTaskDate(end) || start > end) throw new Error("Invalid calendar range");
  const rows = await db.query<{ date: string; count: number }>(`SELECT due_date AS date, COUNT(*) AS count
    FROM tasks WHERE completed_at IS NULL AND due_date >= ? AND due_date <= ? GROUP BY due_date`, [start, end]);
  return Object.fromEntries(rows.map(row => [row.date, row.count]));
}

/** Load future reminders only. Android must schedule them all without a refill on launch. */
export async function loadReminderTasks(now = new Date()): Promise<Task[]> {
  const today = taskDateKey(now);
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return db.query<Task>(`SELECT * FROM tasks WHERE completed_at IS NULL AND reminder_time IS NOT NULL
    AND (due_date > ? OR (due_date = ? AND reminder_time > ?)) ORDER BY due_date, reminder_time, id`, [today, today, time]);
}

export async function loadTasks(): Promise<Task[]> {
  return db.query<Task>("SELECT * FROM tasks ORDER BY completed_at IS NOT NULL, due_date IS NULL, due_date, id DESC");
}

function inputValues(input: TaskInput): (string | number | null)[] {
  if (!isTaskInput(input)) throw new Error("Invalid task input");
  return [input.title.trim(), input.notes.trim(), input.due_date, input.repeat, input.reminder_time];
}

export async function saveTask(input: TaskInput, id?: number): Promise<number> {
  // Keep legacy list/priority metadata for compatible backups. New tasks use
  // database defaults; neither field participates in editing or filtering.
  const values = inputValues(input);
  const savedId = await db.withTransaction(async (tx) => {
    if (id !== undefined) {
      const current = await tx.get<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
      if (!current || current.completed_at) throw new Error("Task is no longer editable");
      const day = (input.repeat === "monthly" || input.repeat === "yearly") && input.due_date
        ? (current.due_date === input.due_date && current.repeat === input.repeat ? current.repeat_day : Number(input.due_date.slice(8))) : null;
      await tx.execute("UPDATE tasks SET title = ?, notes = ?, due_date = ?, repeat = ?, reminder_time = ?, repeat_day = ?, updated_at = datetime('now') WHERE id = ?", [...values, day, id]);
      return id;
    }
    const day = (input.repeat === "monthly" || input.repeat === "yearly") && input.due_date ? Number(input.due_date.slice(8)) : null;
    const result = await tx.execute("INSERT INTO tasks (title, notes, due_date, repeat, reminder_time, repeat_day) VALUES (?, ?, ?, ?, ?, ?)", [...values, day]);
    return result.lastId;
  });
  notifyTaskChanges();
  return savedId;
}

/** Completion and creation of the next occurrence commit together. */
export async function completeTask(id: number): Promise<void> {
  await db.withTransaction(async (tx) => {
    const task = await tx.get<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!task || task.completed_at) return;
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace("T", " ");
    await tx.execute("UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?", [timestamp, timestamp, id]);
    if (task.repeat !== "none" && task.due_date) {
      const day = task.repeat_day ?? Number(task.due_date.slice(8));
      const due = nextTaskDate(task.due_date, task.repeat, day, taskDateKey(now));
      await tx.execute("INSERT INTO tasks (title, notes, list_id, due_date, priority, repeat, reminder_time, repeat_day, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [task.title, task.notes, task.list_id, due, task.priority, task.repeat, task.reminder_time, task.repeat_day, id]);
    }
  });
  notifyTaskChanges();
}

export class TaskUndoError extends Error {}

export async function reopenTask(id: number): Promise<void> {
  await db.withTransaction(async (tx) => {
    const task = await tx.get<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!task?.completed_at) return;
    const child = await tx.get<Task>("SELECT * FROM tasks WHERE parent_id = ?", [id]);
    if (child) {
      // Never erase a later occurrence that the user has edited or completed.
      const unchanged = !child.completed_at && child.title === task.title && child.notes === task.notes &&
        child.list_id === task.list_id && child.priority === task.priority && child.repeat === task.repeat &&
        child.reminder_time === task.reminder_time && child.repeat_day === task.repeat_day &&
        task.repeat !== "none" && task.due_date !== null && child.due_date === nextTaskDate(task.due_date, task.repeat, task.repeat_day ?? Number(task.due_date.slice(8)), taskDateKey(new Date(`${task.completed_at.replace(" ", "T")}Z`)));
      if (!unchanged) throw new TaskUndoError("A later occurrence has changed");
      await tx.execute("DELETE FROM tasks WHERE id = ?", [child.id]);
    }
    await tx.execute("UPDATE tasks SET completed_at = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
  });
  notifyTaskChanges();
}

export async function deleteTask(id: number): Promise<void> {
  await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
  notifyTaskChanges();
}
