import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "../ui/Typography";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, RotateCcw } from "../AppIcons";
import { IconButton } from "../ui/Button";
import type { TaskFilter, TaskOverview } from "../../lib/tasks";
import { localTaskDate } from "../../lib/taskCalendar";
import { isTaskDate } from "../../lib/taskDates";
import { useTaskDesign } from "./design";

const TILES = [{ id: "today", label: "Today", icon: CalendarDays }, { id: "upcoming", label: "Upcoming", icon: CalendarDays }, { id: "overdue", label: "Overdue", icon: RotateCcw }, { id: "completed", label: "Completed", icon: Check }] as const;
export const TaskSummaryTiles = memo(function TaskSummaryTiles({ counts, filter, onFilter }: { counts: TaskOverview; filter: TaskFilter; onFilter: (filter: TaskFilter) => void }) {
  const colors = useTaskDesign();
  return <View className="mb-2 flex-row flex-wrap justify-between gap-y-2">
    {TILES.map((tile, index) => <Pressable key={tile.id} accessibilityRole="button" accessibilityLabel={`${tile.label}: ${counts[tile.id]}`} accessibilityState={{ selected: filter === tile.id }}
      onPress={() => onFilter(tile.id)} className="min-h-[56px] w-[48.6%] justify-center rounded-xl border px-2.5 py-1.5 active:opacity-75"
      style={{ backgroundColor: colors.tiles[index], borderColor: filter === tile.id ? colors.outline : "transparent" }}>
      <View className="flex-row flex-wrap items-center justify-between gap-x-2">
        <View className="min-w-0 flex-row items-center gap-1.5">
          <tile.icon size={14} color={colors.mutedForeground} />
          <Text className="shrink text-label-medium font-medium text-foreground">{tile.label}</Text>
        </View>
        <Text className="text-base font-semibold text-foreground">{counts[tile.id]}</Text>
      </View>
    </Pressable>)}
  </View>;
});

export const TaskCalendar = memo(function TaskCalendar({ days, month, selected, today, counts, week, onSelect, onMove, onWeek, onToday }: {
  days: string[]; month: string; selected: string; today: string; counts: Record<string, number>; week: boolean;
  onSelect: (date: string) => void; onMove: (direction: number) => void; onWeek: (week: boolean) => void; onToday: () => void;
}) {
  const colors = useTaskDesign();
  return <View className="mb-2">
    <View className="mb-1 flex-row items-center justify-between"><View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-2"><Text className="text-xl font-semibold tracking-[-0.5px] text-foreground">{localTaskDate(month).toLocaleDateString("en", { month: "long" })}</Text><Text className="text-xs text-muted-foreground">{month.slice(0, 4)}</Text></View>
      <IconButton icon={ChevronLeft} accessibilityLabel={`Previous ${week ? "week" : "month"}`} onPress={() => onMove(-1)} /><IconButton icon={ChevronRight} accessibilityLabel={`Next ${week ? "week" : "month"}`} onPress={() => onMove(1)} />
    </View>
    <View className="mb-1 flex-row flex-wrap items-center justify-between gap-x-2"><View className="max-w-full flex-row rounded-full border border-outline">{[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: week === value }} onPress={() => onWeek(value)} className="min-h-[48px] shrink justify-center rounded-full px-3 py-1 active:opacity-70" style={{ backgroundColor: week === value ? colors.secondaryContainer : "transparent" }}><Text className="text-label-medium font-medium" style={{ color: week === value ? colors.onSecondaryContainer : colors.foreground }}>{value ? "Week" : "Month"}</Text></Pressable>)}</View><Pressable accessibilityRole="button" onPress={onToday} className="min-h-[48px] max-w-full justify-center px-2"><Text className="text-label-medium font-medium text-primary">Today</Text></Pressable></View>
    <View className="flex-row">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <View key={day} className="flex-1 items-center py-1"><Text className="text-[10px] text-muted-foreground">{day}</Text></View>)}</View>
    <View className="flex-row flex-wrap">{days.map(day => !isTaskDate(day) ? <View key={day} style={{ width: `${100 / 7}%` }} className="min-h-[44px]" /> : <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${localTaskDate(day).toLocaleDateString("en", { dateStyle: "full" })}, ${counts[day] ?? 0} open tasks`} accessibilityState={{ selected: day === selected }} onPress={() => onSelect(day)} style={{ width: `${100 / 7}%` }} className="min-h-[44px] items-center justify-center pb-1">
      <View className="min-h-[28px] min-w-[28px] items-center justify-center rounded-full px-1" style={{ backgroundColor: day === selected ? colors.primary : day === today ? colors.secondaryContainer : "transparent", opacity: day.slice(0, 7) === month.slice(0, 7) || week ? 1 : 0.4 }}><Text className="text-xs font-medium" style={{ color: day === selected ? colors.primaryForeground : day === today ? colors.onSecondaryContainer : colors.foreground }}>{Number(day.slice(8))}</Text></View>
      <View className="mt-0.5 h-[3px] w-[3px] rounded-full" style={{ backgroundColor: counts[day] ? colors.primary : "transparent" }} />
    </Pressable>)}</View>
  </View>;
});

export function TaskAddButton({ onPress, accessibilityLabel = "Add a task", disabled = false }: { onPress: () => void; accessibilityLabel?: string; disabled?: boolean }) {
  const colors = useTaskDesign();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    className="h-12 w-12 items-center justify-center rounded-xl bg-primary-container active:opacity-70 disabled:opacity-50"><Plus size={20} color={colors.onPrimaryContainer} /></Pressable>;
}

export function AgendaHeading({ title, onAdd, disabled = false }: { title: string; onAdd: () => void; disabled?: boolean }) {
  return <View className="mb-1 flex-row items-center justify-between gap-2">
    <Text accessibilityRole="header" className="min-w-0 flex-1 text-base font-semibold text-foreground">{title}</Text>
    <TaskAddButton accessibilityLabel="Add task for selected day" onPress={onAdd} disabled={disabled} />
  </View>;
}
