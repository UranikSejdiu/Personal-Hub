import * as db from "./db";
import { isTaskInput, nextTaskDate, taskDateKey } from "./taskDates";
import { notifyTaskChanges } from "./taskEvents";
import type { Task, TaskInput, TaskList } from "../types/tasks";

export async function loadTasks(): Promise<Task[]> {
  return db.query<Task>("SELECT * FROM tasks ORDER BY completed_at IS NOT NULL, due_date IS NULL, due_date, priority DESC, id DESC");
}

function inputValues(input: TaskInput): (string | number | null)[] {
  if (!isTaskInput(input)) throw new Error("Invalid task input");
  return [input.title.trim(), input.notes.trim(), input.list_id, input.due_date, input.priority, input.repeat, input.reminder_time];
}

export async function saveTask(input: TaskInput, id?: number): Promise<number> {
  const values = inputValues(input);
  const savedId = await db.withTransaction(async (tx) => {
    if (input.list_id !== null && !await tx.get<TaskList>("SELECT id, name FROM task_lists WHERE id = ?", [input.list_id])) throw new Error("Task list no longer exists");
    if (id !== undefined) {
      const current = await tx.get<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
      if (!current || current.completed_at) throw new Error("Task is no longer editable");
      const day = input.repeat === "monthly" && input.due_date
        ? (current.due_date === input.due_date && current.repeat === "monthly" ? current.repeat_day : Number(input.due_date.slice(8))) : null;
      await tx.execute("UPDATE tasks SET title = ?, notes = ?, list_id = ?, due_date = ?, priority = ?, repeat = ?, reminder_time = ?, repeat_day = ?, updated_at = datetime('now') WHERE id = ?", [...values, day, id]);
      return id;
    }
    const day = input.repeat === "monthly" && input.due_date ? Number(input.due_date.slice(8)) : null;
    const result = await tx.execute("INSERT INTO tasks (title, notes, list_id, due_date, priority, repeat, reminder_time, repeat_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [...values, day]);
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
