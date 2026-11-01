import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../ui/Typography";
import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Plus, Search, RotateCcw } from "../AppIcons";
import { IconButton } from "../ui/Button";
import type { TaskFilter, TaskOverview } from "../../lib/tasks";
import { localTaskDate } from "../../lib/taskCalendar";
import { isTaskDate } from "../../lib/taskDates";
import { useTaskDesign } from "./design";

export function TaskHeading({ title, subtitle, onAction, calendar = false }: { title: string; subtitle: string; onAction: () => void; calendar?: boolean }) {
  return <View className="mb-5 flex-row items-center justify-between gap-3">
    <View className="min-w-0 flex-1"><Text className="mb-1 text-xs text-muted-foreground">{subtitle}</Text><Text accessibilityRole="header" className="text-[28px] font-semibold tracking-[-0.8px] text-foreground">{title}</Text></View>
    <IconButton icon={calendar ? Bell : Search} accessibilityLabel={calendar ? "Open reminder settings" : "Search tasks"} onPress={onAction} />
  </View>;
}

const TILES = [{ id: "today", label: "Today", icon: CalendarDays }, { id: "upcoming", label: "Upcoming", icon: CalendarDays }, { id: "overdue", label: "Overdue", icon: RotateCcw }, { id: "completed", label: "Completed", icon: Check }] as const;
export const TaskSummaryTiles = memo(function TaskSummaryTiles({ counts, filter, onFilter }: { counts: TaskOverview; filter: TaskFilter; onFilter: (filter: TaskFilter) => void }) {
  const colors = useTaskDesign();
  return <View className="mb-5 flex-row flex-wrap justify-between gap-y-2">
    {TILES.map((tile, index) => <Pressable key={tile.id} accessibilityRole="button" accessibilityLabel={`${tile.label}: ${counts[tile.id]}`} accessibilityState={{ selected: filter === tile.id }}
      onPress={() => onFilter(tile.id)} className="min-h-[88px] w-[48.6%] rounded-[18px] border px-4 py-3 active:opacity-75"
      style={{ backgroundColor: colors.tiles[index], borderColor: filter === tile.id ? colors.mutedForeground : "transparent" }}>
      <View className="mb-2.5 flex-row items-center justify-between"><Text className="text-[27px] font-semibold leading-8 text-foreground">{counts[tile.id]}</Text><tile.icon size={18} color={colors.mutedForeground} /></View>
      <View className="flex-row items-center justify-between"><Text className="text-xs font-medium text-foreground">{tile.label}</Text><ChevronRight size={12} color={colors.mutedForeground} /></View>
    </Pressable>)}
  </View>;
});

export const TaskCalendar = memo(function TaskCalendar({ days, month, selected, today, counts, week, onSelect, onMove, onWeek, onToday }: {
  days: string[]; month: string; selected: string; today: string; counts: Record<string, number>; week: boolean;
  onSelect: (date: string) => void; onMove: (direction: number) => void; onWeek: (week: boolean) => void; onToday: () => void;
}) {
  const colors = useTaskDesign();
  return <View className="mb-4">
    <View className="mb-3 flex-row items-center justify-between"><View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-2"><Text className="text-xl font-semibold tracking-[-0.5px] text-foreground">{localTaskDate(month).toLocaleDateString("en", { month: "long" })}</Text><Text className="text-xs text-muted-foreground">{month.slice(0, 4)}</Text></View>
      <IconButton icon={ChevronLeft} accessibilityLabel={`Previous ${week ? "week" : "month"}`} onPress={() => onMove(-1)} /><IconButton icon={ChevronRight} accessibilityLabel={`Next ${week ? "week" : "month"}`} onPress={() => onMove(1)} />
    </View>
    <View className="mb-2 flex-row items-center justify-between"><View className="flex-row rounded-xl bg-card p-1">{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: week === value }} onPress={() => onWeek(value)} className="min-h-[40px] justify-center rounded-lg px-3" style={{ backgroundColor: week === value ? colors.secondary : "transparent" }}><Text className="text-xs text-foreground">{value ? "Week" : "Month"}</Text></Pressable>)}</View><Pressable accessibilityRole="button" onPress={onToday} className="min-h-[44px] justify-center px-1"><Text className="text-xs font-medium text-primary">Back to today</Text></Pressable></View>
    <View className="flex-row">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <View key={day} className="flex-1 items-center py-2"><Text className="text-[10px] text-muted-foreground">{day}</Text></View>)}</View>
    <View className="flex-row flex-wrap">{days.map(day => !isTaskDate(day) ? <View key={day} style={{ width: `${100 / 7}%` }} className="min-h-[44px]" /> : <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${localTaskDate(day).toLocaleDateString("en", { dateStyle: "full" })}, ${counts[day] ?? 0} open tasks`} accessibilityState={{ selected: day === selected }} onPress={() => onSelect(day)} style={{ width: `${100 / 7}%` }} className="min-h-[44px] items-center justify-center pb-1">
      <View className="min-h-[33px] min-w-[31px] items-center justify-center rounded-xl px-1" style={{ backgroundColor: day === selected ? colors.foreground : day === today ? colors.secondary : "transparent", opacity: day.slice(0, 7) === month.slice(0, 7) || week ? 1 : 0.4 }}><Text className="text-xs font-medium" style={{ color: day === selected ? colors.card : day === today ? colors.primary : colors.foreground }}>{Number(day.slice(8))}</Text></View>
      <View className="mt-0.5 h-[3px] w-[3px] rounded-full" style={{ backgroundColor: counts[day] ? colors.primary : "transparent" }} />
    </Pressable>)}</View>
  </View>;
});

export function TaskAddButton({ onPress, accessibilityLabel = "Add a task", disabled = false }: { onPress: () => void; accessibilityLabel?: string; disabled?: boolean }) {
  const colors = useTaskDesign();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className="h-[44px] w-[44px] items-center justify-center rounded-[14px] bg-primary active:opacity-70 disabled:opacity-50"><Plus size={20} color={colors.primaryForeground} /></Pressable>;
}

export function AgendaHeading({ title, count, onAdd, disabled = false }: { title: string; count: number; onAdd: () => void; disabled?: boolean }) {
  return <View className="mb-3 flex-row items-center justify-between gap-2"><View className="min-w-0 flex-1"><Text className="text-xl font-semibold tracking-[-0.4px] text-foreground">{title}</Text><Text className="mt-1 text-xs text-muted-foreground">{count} on your plan</Text></View><TaskAddButton accessibilityLabel="Add task for selected day" onPress={onAdd} disabled={disabled} /></View>;
}
