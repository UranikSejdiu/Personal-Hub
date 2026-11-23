import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { toast } from "sonner-native";
import { Text } from "../ui/Typography";
import { Bell, CalendarDays, ChevronRight, MoreHorizontal, Repeat } from "../AppIcons";
import { Checkbox } from "../ui/Checkbox";
import { IconButton } from "../ui/Button";
import { ActionDialog } from "../ui/ActionDialog";
import { localTaskDate } from "../../lib/taskCalendar";
import { openTaskReminderIssueSettings, upcomingTaskReminder, type TaskReminderIssue } from "../../lib/taskReminders";
import { useTaskDesign } from "./design";
import type { Task } from "../../types/tasks";

const REMINDER_ISSUES: Record<TaskReminderIssue, string> = {
  notifications: "Notifications are off",
  channel: "Task reminders are off",
  battery: "Background activity is restricted",
  alarms: "Exact alarms are off · Reminder may be late",
};

export const TaskCard = memo(function TaskCard({ task, today, now, reminderIssue, busy, onToggle, onEdit, onDelete, expanded = false, agenda = false }: {
  task: Task; today: string; busy: boolean; expanded?: boolean; agenda?: boolean;
  now: number; reminderIssue: TaskReminderIssue | null;
  onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  const colors = useTaskDesign();
  const [menu, setMenu] = useState(false);
  const completed = task.completed_at !== null;
  const overdue = !completed && task.due_date !== null && task.due_date < today;
  const date = task.due_date ? task.due_date === today ? "Today" : localTaskDate(task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" }) : "No date";
  const reminder = upcomingTaskReminder(task, now);
  const reminderTime = reminder?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateLabel = reminderTime ? `${agenda ? "" : `${date} · `}Reminder ${reminderTime}` : date;
  return <View className={agenda ? "border-b border-border/60 py-2" : "mb-2 rounded-2xl px-1 py-2"} style={agenda ? undefined : { backgroundColor: overdue ? colors.tiles[2] : colors.card }}>
    <View className="min-h-[64px] flex-row items-center">
      <Checkbox checked={completed} disabled={busy} onPress={() => onToggle(task)} accessibilityLabel={completed ? `Reopen ${task.title}` : `Complete ${task.title}`} />
      <Pressable onPress={() => { if (!completed) onEdit(task); else setMenu(true); }} onLongPress={() => setMenu(true)} disabled={busy}
        accessibilityRole="button" accessibilityLabel={completed ? `${task.title}, completed, task options` : `Edit ${task.title}`} className="min-h-[52px] min-w-0 flex-1 justify-center py-1 active:opacity-70">
        <Text className={`text-sm font-semibold leading-5 ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</Text>
        {expanded && task.notes ? <Text className="mt-1 text-xs leading-[18px] text-muted-foreground">{task.notes}</Text> : null}
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
          {reminder ? <Bell size={11} color={colors.mutedForeground} /> : <CalendarDays size={11} color={overdue ? colors.destructive : colors.mutedForeground} />}
          <Text className={`shrink text-[11px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{overdue ? "Overdue · " : ""}{dateLabel}</Text>
          {task.repeat !== "none" && <><Repeat size={11} color={colors.mutedForeground} /><Text className="text-[11px] capitalize text-muted-foreground">{task.repeat}</Text></>}
        </View>
      </Pressable>
      <IconButton icon={completed ? MoreHorizontal : ChevronRight} disabled={busy} onPress={() => setMenu(true)} accessibilityLabel={`Actions for ${task.title}`} />
    </View>
    {reminder && reminderIssue && (
      <Pressable accessibilityRole="button" accessibilityHint="Opens Android settings" disabled={busy}
        onPress={() => { void openTaskReminderIssueSettings(reminderIssue).catch(() => toast.error("Couldn’t open reminder settings.")); }}
        className="mx-2 min-h-[44px] flex-row items-center gap-2 border-t border-border/60 py-2 active:opacity-70 disabled:opacity-50">
        <Text className="min-w-0 flex-1 text-xs font-medium text-primary">{REMINDER_ISSUES[reminderIssue]}</Text>
        <ChevronRight size={14} color={colors.primary} />
      </Pressable>
    )}
    <ActionDialog visible={menu} title={task.title} onClose={() => setMenu(false)} actions={[
      ...(!completed ? [{ key: "edit", label: "Edit task", primary: true, onPress: () => onEdit(task) }] : []),
      { key: "toggle", label: completed ? `Reopen ${task.title}` : `Complete ${task.title}`, onPress: () => onToggle(task) },
      { key: "delete", label: "Delete", onPress: () => onDelete(task) },
    ]} />
  </View>;
});
