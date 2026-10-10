import { Text } from "../ui/Typography";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { MoreHorizontal, Pencil, Trash2, CalendarDays, Repeat, Bell } from "../AppIcons";
import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { IconButton } from "../ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "../ui/AnchoredMenu";
import { useI18n, type TKey } from "../../lib/i18n";
import { formatTaskDate } from "../../lib/taskDates";
import { useThemeColors } from "../../lib/theme";
import { cn } from "../../lib/utils";
import type { Task, TaskRepeat } from "../../types/tasks";

const REPEAT_KEYS: Record<TaskRepeat, TKey> = { none: "tasksRepeatNone", daily: "tasksRepeatDaily", weekly: "tasksRepeatWeekly", monthly: "tasksRepeatMonthly", yearly: "tasksRepeatYearly" };

export const TaskCard = memo(function TaskCard({ task, today, busy, onToggle, onEdit, onDelete, expanded = false }: {
  task: Task; today: string; busy: boolean;
  expanded?: boolean;
  onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const completed = task.completed_at !== null;
  const overdue = !completed && task.due_date !== null && task.due_date < today;
  return <Card className="mb-2.5 p-3">
    <View className="flex-row items-start gap-1">
      <Checkbox checked={completed} disabled={busy} onPress={() => onToggle(task)}
        accessibilityLabel={t(completed ? "tasksReopenNamed" : "tasksCompleteNamed", { name: task.title })} />
      <Pressable disabled={busy || completed} onPress={() => onEdit(task)} accessible
        accessibilityRole={completed ? "text" : "button"} accessibilityLabel={completed ? task.title : t("tasksEditNamed", { name: task.title })}
        accessibilityState={{ disabled: busy || completed }} className="min-h-[44px] min-w-0 flex-1 justify-center rounded-lg px-1 py-1 active:opacity-70">
        <Text className={cn("text-[15px] font-semibold", completed ? "text-muted-foreground line-through" : "text-foreground")}>{task.title}</Text>
        {task.notes ? <Text numberOfLines={expanded ? undefined : 2} className="mt-1 text-sm text-muted-foreground">{task.notes}</Text> : null}
        {task.due_date || task.repeat !== "none" || task.reminder_time ? <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          {task.due_date ? <View className="flex-row items-center gap-1"><CalendarDays size={12} color={overdue ? colors.destructive : colors.mutedForeground} /><Text className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>{formatTaskDate(task.due_date)}</Text></View> : null}
          {task.repeat !== "none" ? <View className="flex-row items-center gap-1"><Repeat size={12} color={colors.mutedForeground} /><Text className="text-xs text-muted-foreground">{t(REPEAT_KEYS[task.repeat])}</Text></View> : null}
          {task.reminder_time ? <View className="flex-row items-center gap-1"><Bell size={12} color={colors.mutedForeground} /><Text className="text-xs text-muted-foreground">{task.reminder_time}</Text></View> : null}
        </View> : null}
      </Pressable>
      <View ref={triggerRef} collapsable={false}><IconButton icon={MoreHorizontal} disabled={busy} onPress={open}
        selected={anchor !== null} accessibilityLabel={t("tasksActionsNamed", { name: task.title })} accessibilityState={{ expanded: anchor !== null }} /></View>
    </View>
    <AnchoredMenu anchor={anchor} onClose={close} items={[
      ...(!completed ? [{ key: "edit", label: t("tasksEdit"), icon: Pencil, onPress: () => onEdit(task) }] : []),
      { key: "delete", label: t("delete"), icon: Trash2, destructive: true, onPress: () => onDelete(task) },
    ]} />
  </Card>;
});
