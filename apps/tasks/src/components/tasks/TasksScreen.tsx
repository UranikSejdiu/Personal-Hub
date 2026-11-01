import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Pressable, View, type ListRenderItemInfo } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { Text, TextInput } from "../ui/Typography";
import { Button, IconButton } from "../ui/Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { List, Search, X } from "../AppIcons";
import { useI18n } from "../../lib/i18n";
import { calendarDays, localTaskDate, moveCalendarDate } from "../../lib/taskCalendar";
import { isTaskDate, taskDateKey } from "../../lib/taskDates";
import { subscribeTaskChanges } from "../../lib/taskEvents";
import { completeTask, deleteTask, loadTask, loadTaskDayCounts, loadTaskOverview, loadTasksPage, reopenTask, saveTask, TaskUndoError, type TaskFilter, type TaskOverview, type TaskPageOptions } from "../../lib/tasks";
import type { Task, TaskInput } from "../../types/tasks";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";
import { AgendaHeading, TaskAddButton, TaskCalendar, TaskHeading, TaskSummaryTiles } from "./TaskDashboard";
import { useTaskDesign } from "./design";

const EMPTY_COUNTS: TaskOverview = { today: 0, upcoming: 0, overdue: 0, completed: 0, open: 0 };
const CONTENT_STYLE = { paddingBottom: 24 };
const keyForTask = (task: Task) => String(task.id);
type Mode = "overview" | "calendar";

export function TasksScreen({ mode = "overview" }: { mode?: Mode }) {
  const { t } = useI18n();
  const colors = useTaskDesign();
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  const { taskId, compose, filter: routeFilter } = useLocalSearchParams<{ taskId?: string; compose?: string; filter?: string }>();
  const [today, setToday] = useState(taskDateKey);
  const [selectedDate, setSelectedDate] = useState(taskDateKey);
  const [month, setMonth] = useState(() => `${taskDateKey().slice(0, 7)}-01`);
  const [week, setWeek] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const filter: TaskFilter = routeFilter && ["today", "overdue", "upcoming", "completed", "active", "undated"].includes(routeFilter) ? routeFilter as TaskFilter : "today";
  const setFilter = useCallback((value: TaskFilter) => router.setParams({ filter: value }), [router]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editor, setEditorState] = useState<{ task?: Task } | null>(null);
  const handledCompose = useRef<string | null>(null);
  // Treat Add as a one-time command, even when a saved route is revisited.
  useEffect(() => {
    if (!compose || compose === handledCompose.current) return;
    handledCompose.current = compose;
    setEditorState({});
    routerRef.current.setParams({ compose: "" });
  }, [compose]);
  const setEditor = useCallback((value: { task?: Task } | null) => {
    setEditorState(value);
  }, []);
  const [reminder, setReminder] = useState<Task | null>(null);
  const reminderId = useRef<number | null>(null);
  const [deletion, setDeletion] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paging, setPaging] = useState(false);
  const [pagingFailed, setPagingFailed] = useState(false);
  const focused = useRef(false);
  const writing = useRef(false);
  const sequence = useRef(0);
  const pendingWrite = useRef<Promise<void> | null>(null);
  const page = useRef({ offset: 0, hasMore: false, loading: false });
  const listRef = useRef<FlatList<Task>>(null);
  const days = useMemo(() => calendarDays(month, selectedDate, week), [month, selectedDate, week]);
  const query = useMemo<TaskPageOptions>(() => ({ today, filter: mode === "calendar" ? showDone ? "all" : "active" : filter,
    ...(mode === "calendar" ? { date: selectedDate } : { search: debouncedSearch }) }), [today, mode, showDone, filter, selectedDate, debouncedSearch]);

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 220); return () => clearTimeout(timer); }, [search]);
  const refresh = useCallback(async () => {
    if (!focused.current || (AppState.currentState != null && AppState.currentState !== "active")) return;
    const request = ++sequence.current;
    page.current = { offset: 0, hasMore: false, loading: true };
    setLoading(true); setFailed(false); setTasks([]); setPaging(false); setPagingFailed(false);
    try {
      await pendingWrite.current;
      const actualToday = taskDateKey(), targetId = reminderId.current;
      const eligibleDays = days.filter(isTaskDate);
      const [result, overview, calendarCounts, target] = await Promise.all([
        loadTasksPage({ ...query, today: actualToday }),
        loadTaskOverview(actualToday),
        mode === "calendar" ? loadTaskDayCounts(eligibleDays[0], eligibleDays[eligibleDays.length - 1]) : Promise.resolve({}),
        targetId === null ? Promise.resolve(undefined) : loadTask(targetId),
      ]);
      if (!focused.current || request !== sequence.current) return;
      setToday(actualToday); setTasks(result.tasks); setCounts(overview); setDayCounts(calendarCounts);
      page.current = { offset: result.nextOffset, hasMore: result.hasMore, loading: false };
      if (targetId !== null && targetId === reminderId.current) setReminder(target ?? null);
    } catch {
      if (focused.current && request === sequence.current) { setFailed(true); toast.error(t("errorLoadingData")); }
    } finally {
      if (focused.current && request === sequence.current) { page.current.loading = false; setLoading(false); }
    }
  }, [days, mode, query, t]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; if (focused.current) void refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => {
    focused.current = true; setBusy(writing.current); void refreshRef.current();
    const unsubscribe = subscribeTaskChanges(() => { if (!writing.current) void refreshRef.current(); });
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { clearTimeout(midnight); midnight = undefined; };
    const schedule = () => {
      stop(); if (AppState.currentState != null && AppState.currentState !== "active") return;
      const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnight = setTimeout(() => { void refreshRef.current(); schedule(); }, next.getTime() - now.getTime());
    };
    const listener = AppState.addEventListener("change", state => { if (state === "active") { void refreshRef.current(); schedule(); } else { ++sequence.current; stop(); } });
    schedule();
    return () => { focused.current = false; ++sequence.current; unsubscribe(); listener.remove(); stop(); setEditor(null); setDeletion(null); };
  }, [setEditor]));

  useEffect(() => {
    if (!taskId) return;
    let active = true;
    const id = Number(taskId);
    void (async () => {
      try {
        const target = Number.isSafeInteger(id) && id > 0 ? await loadTask(id) : undefined;
        if (!active) return;
        reminderId.current = target?.id ?? null; setReminder(target ?? null);
        if (!target) toast.error(t("tasksReminderMissing"));
        router.setParams({ taskId: undefined });
      } catch { if (active) toast.error(t("errorLoadingData")); }
    })();
    return () => { active = false; };
  }, [taskId, router, t]);
  useEffect(() => { if (reminder) listRef.current?.scrollToOffset({ offset: 0, animated: true }); }, [reminder]);

  const perform = useCallback(async (operation: () => Promise<void>, committed?: () => void) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); ++sequence.current;
    const promise = Promise.resolve().then(operation);
    pendingWrite.current = promise.catch(() => undefined);
    try { await promise; if (focused.current) committed?.(); }
    finally { writing.current = false; pendingWrite.current = null; if (focused.current) { setBusy(false); await refreshRef.current(); } }
  }, []);
  const toggleTask = useCallback((task: Task) => {
    if (writing.current) return;
    const operation = task.completed_at ? () => reopenTask(task.id) : () => completeTask(task.id);
    void perform(operation, () => {
      if (task.completed_at) { toast.success("Task reopened"); return; }
      toast.success(task.repeat === "none" ? "Task completed" : "Done. Next occurrence added.", { duration: 8000, action: { label: "Undo", onClick: () => {
        void perform(() => reopenTask(task.id)).catch(error => toast.error(t(error instanceof TaskUndoError ? "tasksUndoBlocked" : "errorSavingData")));
      } } });
    }).catch(error => toast.error(t(error instanceof TaskUndoError ? "tasksUndoBlocked" : "errorSavingData")));
  }, [perform, t]);
  const editTask = useCallback((task: Task) => setEditor({ task }), [setEditor]);
  const askDelete = useCallback((task: Task) => setDeletion(task), []);
  const save = (input: TaskInput, id?: number) => perform(async () => { await saveTask(input, id); }, () => setEditor(null));
  const loadMore = useCallback(async () => {
    if (!focused.current || writing.current || page.current.loading || !page.current.hasMore || (AppState.currentState != null && AppState.currentState !== "active")) return;
    const request = sequence.current, offset = page.current.offset;
    page.current.loading = true; setPaging(true); setPagingFailed(false);
    try {
      const result = await loadTasksPage({ ...query, today: taskDateKey(), offset });
      if (!focused.current || request !== sequence.current) return;
      page.current = { offset: result.nextOffset, hasMore: result.hasMore, loading: false };
      setTasks(current => [...current, ...result.tasks]);
    } catch { if (focused.current && request === sequence.current) setPagingFailed(true); }
    finally { if (focused.current && request === sequence.current) { page.current.loading = false; setPaging(false); } }
  }, [query]);
  const visible = useMemo(() => failed ? [] : tasks.filter(task => task.id !== reminder?.id), [failed, tasks, reminder]);
  const renderTask = useCallback(({ item }: ListRenderItemInfo<Task>) => <TaskCard task={item} today={today} busy={busy || loading} agenda={mode === "calendar"} onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} />,
    [today, busy, loading, mode, toggleTask, editTask, askDelete]);
  const heading = mode === "calendar" ? "A little planning." : "Make room for today.";
  const subtitle = mode === "calendar" ? "Make space for what matters." : localTaskDate(today).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });
  const focusTitle = filter === "today" ? "Today’s focus" : filter === "overdue" ? "A little overdue" : filter === "upcoming" ? "Coming up" : filter === "completed" ? "Things you’ve done" : "All open tasks";
  const move = (direction: number) => {
    const next = moveCalendarDate(week ? selectedDate : month, direction, week);
    setMonth(`${next.slice(0, 7)}-01`); setSelectedDate(next);
  };
  const header = <View>
    <TaskHeading title={heading} subtitle={subtitle} calendar={mode !== "overview"} onAction={() => { if (mode !== "overview") router.navigate("/(tasks)/settings"); else { setSearchOpen(value => !value); setSearch(""); } }} />
    {mode === "overview" && <>
      <TaskSummaryTiles counts={counts} filter={filter} onFilter={setFilter} />
      {searchOpen && <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3"><Search size={16} color={colors.mutedForeground} /><TextInput autoFocus value={search} onChangeText={setSearch} placeholder="Find a task…" accessibilityLabel="Search tasks" placeholderTextColor={colors.mutedForeground} className="min-h-[46px] min-w-0 flex-1 text-base text-foreground" /></View>}
      <View className="mb-2 flex-row items-center justify-between gap-2"><Text className="min-w-0 flex-1 text-lg font-semibold tracking-[-0.4px] text-foreground">{focusTitle}</Text><View className="flex-row items-center gap-3"><Pressable accessibilityRole="button" onPress={() => router.setParams({ filter: filter === "active" ? "today" : "active" })} className="min-h-[44px] justify-center"><Text className="text-xs text-muted-foreground">{filter === "active" ? "Today" : "All tasks"}</Text></Pressable><TaskAddButton onPress={() => setEditor({})} disabled={busy} /></View></View>
      {filter === "today" && counts.overdue > 0 && <Text className="mb-3 text-xs text-destructive">{counts.overdue} overdue · still worth a little attention</Text>}
    </>}
    {mode === "calendar" && <><TaskCalendar days={days} month={month} selected={selectedDate} today={today} counts={dayCounts} week={week} onWeek={setWeek} onMove={move} onToday={() => { const date = taskDateKey(); setSelectedDate(date); setMonth(`${date.slice(0, 7)}-01`); }} onSelect={date => { setSelectedDate(date); setMonth(`${date.slice(0, 7)}-01`); }} />
      <AgendaHeading title={selectedDate === today ? "Today’s tasks" : localTaskDate(selectedDate).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" })} count={dayCounts[selectedDate] ?? 0} onAdd={() => setEditor({})} disabled={busy} />
      <Pressable accessibilityRole="button" accessibilityState={{ selected: showDone }} onPress={() => setShowDone(value => !value)} className="mb-2 min-h-[44px] justify-center"><Text className="text-xs text-muted-foreground">{showDone ? "Hide" : "Show"} completed tasks</Text></Pressable>
    </>}
    {reminder && <View className="mb-3 rounded-2xl border border-primary p-2"><View className="flex-row items-center justify-between"><Text className="text-xs font-semibold text-primary">Task from reminder</Text><IconButton icon={X} accessibilityLabel="Dismiss task from reminder" onPress={() => { reminderId.current = null; setReminder(null); }} /></View><TaskCard task={reminder} today={today} busy={busy || loading} expanded onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} /></View>}
  </View>;
  const empty = loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading tasks" className="my-8" /> : failed ? <View className="items-center gap-3 py-8"><Text className="text-sm text-destructive">Could not load your tasks.</Text><Button label="Retry" onPress={() => void refresh()} /></View> : reminder && tasks.length > 0 ? undefined : <View className="items-center gap-2 py-8"><List size={28} color={colors.primary} /><Text className="text-base font-semibold text-foreground">{debouncedSearch ? "No matching tasks" : "A little breathing room."}</Text><Text className="text-center text-sm text-muted-foreground">{debouncedSearch ? "Try another name or clear the search." : "Nothing here for now. Take it one thing at a time."}</Text></View>;
  return <>
    <View className="flex-1 bg-background"><View className="w-full max-w-md flex-1 self-center px-5 max-[360px]:px-4 pt-5">
      <FlatList ref={listRef} data={visible} keyExtractor={keyForTask} renderItem={renderTask} ListHeaderComponent={header} ListEmptyComponent={empty} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} keyboardShouldPersistTaps="handled" contentContainerStyle={CONTENT_STYLE} showsVerticalScrollIndicator={false}
          onEndReached={() => { if (!pagingFailed) void loadMore(); }} onEndReachedThreshold={0.3} ListFooterComponent={paging ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading more tasks" /> : pagingFailed ? <Button label="Retry loading more" onPress={() => void loadMore()} /> : undefined} />
    </View></View>
    {editor && <TaskEditor task={editor.task} initialDate={mode === "calendar" ? selectedDate : today} onSave={save} onClose={() => setEditor(null)} onDelete={editor.task ? () => setDeletion(editor.task!) : undefined} />}
    <ConfirmDialog visible={deletion !== null} destructive title="Delete task?" message={`Delete “${deletion?.title ?? ""}”? Other occurrences of a recurring task are kept.`} confirmLabel="Delete" onClose={() => setDeletion(null)} onConfirm={async () => { if (deletion) await perform(() => deleteTask(deletion.id), () => { if (editor?.task?.id === deletion.id) setEditor(null); setDeletion(null); }); }} />
  </>;
}
