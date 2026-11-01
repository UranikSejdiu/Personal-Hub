export type TaskRepeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface TaskInput {
  title: string;
  notes: string;
  due_date: string | null;
  repeat: TaskRepeat;
  reminder_time: string | null;
}

export interface Task extends TaskInput {
  /** Legacy list association retained for backup compatibility. */
  list_id: number | null;
  /** Legacy backup metadata; not used for editing or sorting. */
  priority: 0 | 1 | 2;
  id: number;
  completed_at: string | null;
  repeat_day: number | null;
  parent_id: number | null;
  created_at: string;
  updated_at: string;
}
