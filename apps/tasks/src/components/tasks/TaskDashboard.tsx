import { memo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "../ui/Typography";
import { Bell, CalendarDays, Check, ChevronLeft, ChevronRight, List, MoreHorizontal, Plus, Search, RotateCcw } from "../AppIcons";
import { IconButton } from "../ui/Button";
import type { TaskFilter, TaskListSummary, TaskOverview } from "../../lib/tasks";
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

export function TaskListChips({ lists, selected, onSelect }: { lists: TaskListSummary[]; selected: number | null | undefined; onSelect: (id: number | null | undefined) => void }) {
  const colors = useTaskDesign();
  const options = [{ id: undefined, name: "All lists" }, ...lists];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerClassName="gap-1.5 py-1">
    {options.map(list => <Pressable key={String(list.id)} accessibilityRole="button" accessibilityState={{ selected: list.id === selected }} onPress={() => onSelect(list.id)}
      className="min-h-[40px] flex-row items-center gap-1.5 rounded-xl border px-3 py-2 active:opacity-70" style={{ backgroundColor: selected === list.id ? colors.foreground : colors.card, borderColor: selected === list.id ? colors.foreground : colors.border }}>
      {list.id !== undefined && <View className="h-1 w-1 rounded-full" style={{ backgroundColor: selected === list.id ? colors.card : colors.primary }} />}
      <Text className="text-xs font-medium" style={{ color: selected === list.id ? colors.card : colors.foreground }}>{list.name}</Text>
    </Pressable>)}
  </ScrollView>;
}

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

export function TaskListTile({ list, onPress, onMenu }: { list: TaskListSummary; onPress: () => void; onMenu: () => void }) {
  const colors = useTaskDesign();
  return <View className="mb-2 flex-row items-center gap-3 rounded-[18px] bg-card px-4 py-2">
    <Pressable accessibilityRole="button" accessibilityLabel={`${list.name}, ${list.open} open tasks`} onPress={onPress} className="min-h-[70px] min-w-0 flex-1 flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: colors.tiles[list.id === null ? 0 : list.id % 4] }}><List size={18} color={colors.primary} /></View>
      <View className="min-w-0 flex-1"><Text className="text-base font-semibold text-foreground">{list.name}</Text><Text className="mt-1 text-xs text-muted-foreground">{list.open} open · {list.completed} completed</Text></View>
    </Pressable>
    {list.id !== null ? <IconButton icon={MoreHorizontal} accessibilityLabel={`Manage ${list.name}`} onPress={onMenu} /> : null}
  </View>;
}

export function AgendaHeading({ title, count, onAdd }: { title: string; count: number; onAdd: () => void }) {
  const colors = useTaskDesign();
  return <View className="mb-3 flex-row items-center justify-between gap-2"><View className="min-w-0 flex-1"><Text className="text-xl font-semibold tracking-[-0.4px] text-foreground">{title}</Text><Text className="mt-1 text-xs text-muted-foreground">{count} on your plan</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add task for selected day" onPress={onAdd} className="h-10 w-10 items-center justify-center rounded-xl bg-primary"><Plus size={18} color={colors.primaryForeground} /></Pressable></View>;
}
