import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../ui/Typography";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "../AppIcons";
import { AnchoredMenu, useAnchoredMenu } from "../ui/AnchoredMenu";
import { IconButton } from "../ui/Button";
import type { TaskFilter, TaskOverview } from "../../lib/tasks";
import { localTaskDate } from "../../lib/taskCalendar";
import { isTaskDate } from "../../lib/taskDates";
import { useThemeColors } from "../../lib/theme";
import { cn } from "../../lib/utils";

export const TaskFilterBar = memo(function TaskFilterBar({ counts, filter, onFilter }: { counts: TaskOverview; filter: TaskFilter; onFilter: (filter: TaskFilter) => void }) {
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const colors = useThemeColors();
  const options: { id: TaskFilter; label: string; count: number }[] = [
    { id: "today", label: "Today", count: counts.today + counts.overdue },
    { id: "upcoming", label: "Upcoming", count: counts.upcoming },
    { id: "overdue", label: "Overdue", count: counts.overdue },
    { id: "undated", label: "No due date", count: counts.open - counts.today - counts.overdue - counts.upcoming },
    { id: "active", label: "All open", count: counts.open },
    { id: "completed", label: "Completed", count: counts.completed },
  ];
  const current = options.find(option => option.id === filter) ?? options[0];
  return <>
    <View ref={triggerRef} collapsable={false} className="mb-3 self-start">
      <Pressable onPress={open} accessibilityRole="button"
        accessibilityLabel={`Task view, ${current.label}`} accessibilityHint="Choose which tasks to show"
        accessibilityState={{ expanded: anchor !== null }}
        className="min-h-[48px] flex-row items-center gap-2 rounded-[20px] border border-border bg-surface px-4 py-2 active:bg-surface-container-high">
        <Text className="shrink text-base font-semibold text-foreground">{current.label}</Text>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
    <AnchoredMenu anchor={anchor} onClose={close} align="start"
      items={options.map(option => ({
        key: option.id, label: option.count > 0 ? `${option.label} (${option.count})` : option.label, selected: option.id === filter,
        onPress: () => onFilter(option.id),
      }))} />
  </>;
});

export const TaskCalendar = memo(function TaskCalendar({ days, month, selected, today, counts, week, onSelect, onMove, onWeek, onToday }: {
  days: string[]; month: string; selected: string; today: string; counts: Record<string, number>; week: boolean;
  onSelect: (date: string) => void; onMove: (direction: number) => void; onWeek: (week: boolean) => void; onToday: () => void;
}) {
  const colors = useThemeColors();
  return <View className="mb-4 gap-2 rounded-[24px] border border-border bg-surface p-3">
    <View className="flex-row items-center justify-between gap-1.5">
      <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-2 px-1">
        <Text className="text-xl font-semibold text-foreground">{localTaskDate(month).toLocaleDateString("en", { month: "long" })}</Text>
        <Text className="text-label-medium text-muted-foreground">{month.slice(0, 4)}</Text>
      </View>
      <IconButton className="bg-surface-container-high" icon={ChevronLeft} disabled={week ? days[0] <= today : month.slice(0, 7) <= today.slice(0, 7)} accessibilityLabel={`Previous ${week ? "week" : "month"}`} onPress={() => onMove(-1)} />
      <IconButton className="bg-surface-container-high" icon={ChevronRight} accessibilityLabel={`Next ${week ? "week" : "month"}`} onPress={() => onMove(1)} />
    </View>
    <View className="flex-row flex-wrap items-center justify-between gap-2">
      <View className="max-w-full flex-row gap-1 rounded-[24px] border border-border bg-background p-1">
        {[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button"
          accessibilityState={{ selected: week === value }} onPress={() => onWeek(value)}
          className={cn("min-h-[48px] shrink items-center justify-center rounded-[20px] px-3 py-1 active:opacity-70", week === value && "bg-secondary-container")}>
          <Text className={cn("text-label-large", week === value ? "font-semibold text-on-secondary-container" : "font-medium text-muted-foreground")}>
            {value ? "Week" : "Month"}
          </Text>
        </Pressable>)}
      </View>
      <Pressable accessibilityRole="button" onPress={onToday} className="min-h-[48px] max-w-full justify-center rounded-full px-3 active:opacity-70">
        <Text className="text-label-large font-medium text-primary">Today</Text>
      </Pressable>
    </View>
    <View>
      <View className="flex-row">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <View key={day} className="flex-1 items-center py-1">
          <Text className="text-label-medium text-muted-foreground">{day}</Text>
        </View>)}
      </View>
      <View className="flex-row flex-wrap">{days.map(day => {
        const width = "14.28%" as const;
        if (!isTaskDate(day)) return <View key={day} style={{ width }} className="min-h-[48px]" />;
        const active = day === selected;
        const currentDay = day === today;
        return <Pressable key={day} accessibilityRole="button"
          accessibilityLabel={`${localTaskDate(day).toLocaleDateString("en", { dateStyle: "full" })}, ${counts[day] ?? 0} open tasks`}
          disabled={day < today} accessibilityState={{ selected: active, disabled: day < today }} onPress={() => onSelect(day)} style={{ width }}
          className="min-h-[48px] items-center justify-center active:opacity-70 disabled:opacity-40">
          <View className="items-center justify-center" style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden",
            backgroundColor: active ? colors.primary : currentDay ? colors.secondaryContainer : "transparent" }}>
            <Text className="text-label-medium font-semibold" style={{
              color: active ? colors.primaryForeground
                : currentDay ? colors.onSecondaryContainer
                : day.slice(0, 7) === month.slice(0, 7) || week ? colors.foreground : colors.mutedForeground,
            }}>{Number(day.slice(8))}</Text>
          </View>
          <View className={cn("mt-0.5 h-1 w-1 rounded-full", counts[day] && "bg-primary")} />
        </Pressable>;
      })}</View>
    </View>
  </View>;
});

export function TaskAddButton({ onPress, accessibilityLabel = "Add a task", disabled = false }: { onPress: () => void; accessibilityLabel?: string; disabled?: boolean }) {
  const colors = useThemeColors();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-70 disabled:opacity-50"><Plus size={20} color={colors.primaryForeground} /></Pressable>;
}

export function AgendaHeading({ title, onAdd, disabled = false }: { title: string; onAdd: () => void; disabled?: boolean }) {
  return <View className="mb-1 flex-row items-center justify-between gap-2">
    <Text accessibilityRole="header" className="min-w-0 flex-1 text-base font-semibold text-foreground">{title}</Text>
    <TaskAddButton accessibilityLabel="Add task for selected day" onPress={onAdd} disabled={disabled} />
  </View>;
}
