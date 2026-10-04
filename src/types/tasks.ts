export type TaskRepeat = "none" | "daily" | "weekly" | "monthly";
export type TaskPriority = 0 | 1 | 2;

export interface TaskInput {
  title: string;
  notes: string;
  list_id: number | null;
  due_date: string | null;
  priority: TaskPriority;
  repeat: TaskRepeat;
  reminder_time: string | null;
}

export interface Task extends TaskInput {
  id: number;
  completed_at: string | null;
  repeat_day: number | null;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskList {
  id: number;
  name: string;
}
