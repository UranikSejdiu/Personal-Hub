import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../ui/Typography";
import { Bell, CalendarDays, ChevronRight, MoreHorizontal, Repeat } from "../AppIcons";
import { Checkbox } from "../ui/Checkbox";
import { IconButton } from "../ui/Button";
import { ActionDialog } from "../ui/ActionDialog";
import { useI18n } from "../../lib/i18n";
import { localTaskDate } from "../../lib/taskCalendar";
import { useTaskDesign } from "./design";
import type { Task } from "../../types/tasks";

export const TaskCard = memo(function TaskCard({ task, today, busy, onToggle, onEdit, onDelete, expanded = false, agenda = false }: {
  task: Task; today: string; busy: boolean; expanded?: boolean; agenda?: boolean;
  onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  const { t } = useI18n();
  const colors = useTaskDesign();
  const [menu, setMenu] = useState(false);
  const completed = task.completed_at !== null;
  const overdue = !completed && task.due_date !== null && task.due_date < today;
  const date = task.due_date ? task.due_date === today ? "Today" : localTaskDate(task.due_date).toLocaleDateString("en", { month: "short", day: "numeric" }) : "No date";
  return <View className={agenda ? "border-b border-border/60 py-2" : "mb-2 rounded-[17px] px-1 py-2"} style={agenda ? undefined : { backgroundColor: overdue ? colors.tiles[2] : colors.card }}>
    <View className="min-h-[64px] flex-row items-center">
      <Checkbox checked={completed} disabled={busy} onPress={() => onToggle(task)} accessibilityLabel={t(completed ? "tasksReopenNamed" : "tasksCompleteNamed", { name: task.title })} />
      <Pressable onPress={() => { if (!completed) onEdit(task); else setMenu(true); }} onLongPress={() => setMenu(true)} disabled={busy}
        accessibilityRole="button" accessibilityLabel={completed ? `${task.title}, completed, task options` : t("tasksEditNamed", { name: task.title })} className="min-h-[52px] min-w-0 flex-1 justify-center py-1 active:opacity-70">
        <Text className={`text-sm font-semibold leading-5 ${completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</Text>
        {expanded && task.notes ? <Text className="mt-1 text-xs leading-[18px] text-muted-foreground">{task.notes}</Text> : null}
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
          {task.reminder_time ? <Bell size={11} color={overdue ? colors.destructive : colors.mutedForeground} /> : <CalendarDays size={11} color={overdue ? colors.destructive : colors.mutedForeground} />}
          <Text className={`text-[11px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{overdue ? "Overdue · " : ""}{!agenda || !task.reminder_time ? date : ""}{task.reminder_time ? `${!agenda ? " · " : ""}${task.reminder_time}` : ""}</Text>
          {task.repeat !== "none" && <><Repeat size={11} color={colors.mutedForeground} /><Text className="text-[11px] capitalize text-muted-foreground">{task.repeat}</Text></>}
        </View>
      </Pressable>
      <IconButton icon={completed ? MoreHorizontal : ChevronRight} disabled={busy} onPress={() => setMenu(true)} accessibilityLabel={t("tasksActionsNamed", { name: task.title })} />
    </View>
    <ActionDialog visible={menu} title={task.title} onClose={() => setMenu(false)} actions={[
      ...(!completed ? [{ key: "edit", label: t("tasksEdit"), primary: true, onPress: () => onEdit(task) }] : []),
      { key: "toggle", label: t(completed ? "tasksReopenNamed" : "tasksCompleteNamed", { name: task.title }), onPress: () => onToggle(task) },
      { key: "delete", label: t("delete"), onPress: () => onDelete(task) },
    ]} />
  </View>;
});
