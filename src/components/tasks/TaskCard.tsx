import { Text } from "../ui/Typography";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { MoreHorizontal, Pencil, Trash2, CalendarDays, Repeat, Bell } from "../AppIcons";
import { Checkbox } from "../ui/Checkbox";
import { IconButton } from "../ui/Button";
import { AnchoredMenu, useAnchoredMenu } from "../ui/AnchoredMenu";
import { useI18n, type TKey } from "../../lib/i18n";
import { formatTaskDate } from "../../lib/taskDates";
import { useThemeColors } from "../../lib/theme";
import { cn } from "../../lib/utils";
import type { Task, TaskRepeat } from "../../types/tasks";

const REPEAT_KEYS: Record<TaskRepeat, TKey> = { none: "tasksRepeatNone", daily: "tasksRepeatDaily", weekly: "tasksRepeatWeekly", monthly: "tasksRepeatMonthly", yearly: "tasksRepeatYearly" };

export const TaskCard = memo(function TaskCard({ task, today, busy, onToggle, onEdit, onDelete, expanded = false, grouped }: {
  task: Task; today: string; busy: boolean;
  expanded?: boolean;
  grouped?: "first" | "middle" | "last" | "only";
  onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const completed = task.completed_at !== null;
  const overdue = !completed && task.due_date !== null && task.due_date < today;
  return <View className={cn("border-border/60 bg-card px-3", !grouped ? "mb-2.5 rounded-[14px] border" : "border-x",
    (grouped === "first" || grouped === "only") && "rounded-t-[14px] border-t",
    (grouped === "last" || grouped === "only") && "rounded-b-[14px] border-b")}>
    <View className={cn("min-h-[68px] flex-row items-start gap-[5px] py-2", (grouped === "middle" || grouped === "last") && "border-t border-border/60")}>
      <Checkbox className="w-8" hitSlop={6} checked={completed} disabled={busy} onPress={() => onToggle(task)}
        accessibilityLabel={t(completed ? "tasksReopenNamed" : "tasksCompleteNamed", { name: task.title })} />
      <Pressable disabled={busy || completed} onPress={() => onEdit(task)} accessible
        accessibilityRole={completed ? "text" : "button"} accessibilityLabel={completed ? task.title : t("tasksEditNamed", { name: task.title })}
        accessibilityState={{ disabled: busy || completed }} className="min-h-[44px] min-w-0 flex-1 justify-center rounded-lg pt-[5px] active:opacity-70">
        <Text className={cn("text-sm font-semibold", completed ? "text-muted-foreground line-through" : "text-foreground")}>{task.title}</Text>
        {task.notes ? <Text numberOfLines={expanded ? undefined : 1} className="mt-[3px] text-xs leading-[18px] text-muted-foreground">{task.notes}</Text> : null}
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-[7px] gap-y-1">
          {!task.due_date ? <Text className="text-[10px] text-muted-foreground">{t("tasksNoDate")}</Text> : <View className="flex-row items-center gap-1"><CalendarDays size={11} color={overdue ? colors.destructive : colors.mutedForeground} /><Text className={cn("text-[10px]", overdue ? "text-destructive" : "text-muted-foreground")}>{formatTaskDate(task.due_date)}</Text></View>}
          {task.repeat !== "none" ? <View className="flex-row items-center gap-1"><Repeat size={11} color={colors.mutedForeground} /><Text className="text-[10px] text-muted-foreground">{t(REPEAT_KEYS[task.repeat])}</Text></View> : null}
          {task.reminder_time ? <View className="flex-row items-center gap-1"><Bell size={11} color={colors.mutedForeground} /><Text className="text-[10px] text-muted-foreground">{task.reminder_time}</Text></View> : null}
        </View>
      </Pressable>
      <View ref={triggerRef} collapsable={false}><IconButton icon={MoreHorizontal} disabled={busy} onPress={open}
        selected={anchor !== null} accessibilityLabel={t("tasksActionsNamed", { name: task.title })} accessibilityState={{ expanded: anchor !== null }} /></View>
    </View>
    <AnchoredMenu anchor={anchor} onClose={close} items={[
      ...(!completed ? [{ key: "edit", label: t("tasksEdit"), icon: Pencil, onPress: () => onEdit(task) }] : []),
      { key: "delete", label: t("delete"), icon: Trash2, destructive: true, onPress: () => onDelete(task) },
    ]} />
  </View>;
});
