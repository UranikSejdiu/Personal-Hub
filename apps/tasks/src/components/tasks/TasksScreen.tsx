import { actionErrorOptions } from "../../lib/actionErrorOptions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Pressable, View, type ListRenderItemInfo } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { Text, TextInput } from "../ui/Typography";
import { Button, IconButton } from "../ui/Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Search, X } from "../AppIcons";
import { calendarDays, localTaskDate, moveCalendarDate } from "../../lib/taskCalendar";
import { isTaskDate, taskDateKey } from "../../lib/taskDates";
import { subscribeTaskChanges } from "../../lib/taskEvents";
import { getTaskReminderIssue, upcomingTaskReminder, type TaskReminderIssue } from "../../lib/taskReminders";
import { moveTaskToTomorrow, completeTask, deleteTask, loadTask, loadTaskDayCounts, loadTaskOverview, loadTasksPage, reopenTask, saveTask, TaskUndoError, type TaskFilter, type TaskOverview, type TaskPageOptions } from "../../lib/tasks";
import type { Task, TaskInput } from "../../types/tasks";
import { TaskCard } from "./TaskCard";
import { TaskEditor } from "./TaskEditor";
import { AgendaHeading, TaskAddButton, TaskCalendar, TaskFilterBar } from "./TaskDashboard";
import { useThemeColors } from "../../lib/theme";

const EMPTY_COUNTS: TaskOverview = { today: 0, upcoming: 0, overdue: 0, completed: 0, open: 0 };
const CONTENT_STYLE = { paddingBottom: 24 };
const keyForTask = (task: Task) => String(task.id);
type Mode = "overview" | "calendar";

export function TasksScreen({ mode = "overview" }: { mode?: Mode }) {
  const colors = useThemeColors();
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
  const [reminderIssue, setReminderIssue] = useState<TaskReminderIssue | null>(null);
  const [remindersVisible, setRemindersVisible] = useState(false);
  const [reminderNow, setReminderNow] = useState(Date.now);
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
      if (!focused.current || request !== sequence.current) return;
      const actualToday = taskDateKey(), targetId = reminderId.current;
      const eligibleDays = mode === "calendar" ? days.filter(isTaskDate) : [];
      const [result, overview, calendarCounts, target] = await Promise.all([
        loadTasksPage({ ...query, today: actualToday }),
        mode === "overview" ? loadTaskOverview(actualToday) : EMPTY_COUNTS,
        mode === "calendar" ? loadTaskDayCounts(eligibleDays[0], eligibleDays[eligibleDays.length - 1]) : Promise.resolve({}),
        targetId === null ? Promise.resolve(undefined) : loadTask(targetId),
      ]);
      if (!focused.current || request !== sequence.current) return;
      if (mode === "calendar" && query.date && query.date < actualToday) {
        setSelectedDate(actualToday);
        setMonth(`${actualToday.slice(0, 7)}-01`);
      }
      setToday(actualToday); setTasks(result.tasks); setCounts(overview); setDayCounts(calendarCounts);
      page.current = { offset: result.nextOffset, hasMore: result.hasMore, loading: false };
      if (targetId !== null && targetId === reminderId.current) setReminder(target ?? null);
    } catch {
      if (focused.current && request === sequence.current) { setFailed(true); toast.error("Failed to load data."); }
    } finally {
      if (focused.current && request === sequence.current) { page.current.loading = false; setLoading(false); }
    }
  }, [days, mode, query]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; if (focused.current) void refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => {
    focused.current = true; setBusy(writing.current); void refreshRef.current();
    let deliveryRequest = 0;
    const refreshDelivery = () => {
      if (AppState.currentState != null && AppState.currentState !== "active") return;
      const request = ++deliveryRequest;
      setRemindersVisible(true);
      setReminderNow(Date.now());
      void getTaskReminderIssue().catch(() => null).then(issue => {
        if (request === deliveryRequest) setReminderIssue(issue);
      });
    };
    refreshDelivery();
    const unsubscribe = subscribeTaskChanges(() => { if (!writing.current) void refreshRef.current(); });
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { clearTimeout(midnight); midnight = undefined; };
    const schedule = () => {
      stop(); if (AppState.currentState != null && AppState.currentState !== "active") return;
      const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnight = setTimeout(() => { void refreshRef.current(); schedule(); }, next.getTime() - now.getTime());
    };
    const listener = AppState.addEventListener("change", state => { if (state === "active") { void refreshRef.current(); refreshDelivery(); schedule(); } else { setRemindersVisible(false); ++sequence.current; ++deliveryRequest; stop(); } });
    schedule();
    return () => { setRemindersVisible(false); focused.current = false; ++sequence.current; ++deliveryRequest; unsubscribe(); listener.remove(); stop(); setEditor(null); setDeletion(null); };
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
        if (!target) toast.error("This task no longer exists.", actionErrorOptions);
        router.setParams({ taskId: undefined });
      } catch { if (active) toast.error("Failed to load data."); }
    })();
    return () => { active = false; };
  }, [taskId, router]);
  useEffect(() => { if (reminder) listRef.current?.scrollToOffset({ offset: 0, animated: true }); }, [reminder]);
  useEffect(() => {
    if (!remindersVisible) return;
    let next = reminder ? upcomingTaskReminder(reminder, reminderNow)?.getTime() ?? Infinity : Infinity;
    for (const task of tasks) {
      next = Math.min(next, upcomingTaskReminder(task, reminderNow)?.getTime() ?? Infinity);
    }
    if (!Number.isFinite(next)) return;
    // One timer for the list, so a reminder stops looking upcoming once its time passes.
    const timer = setTimeout(() => setReminderNow(Date.now()), Math.max(1, Math.min(next - Date.now(), 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [tasks, reminder, reminderNow, remindersVisible]);

  const perform = useCallback(async (operation: () => Promise<void>, committed?: () => void) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); ++sequence.current;
    const promise = Promise.resolve().then(operation);
    pendingWrite.current = promise.catch(() => undefined);
    try { await promise; if (focused.current) committed?.(); }
    finally { writing.current = false; pendingWrite.current = null; if (focused.current) { setBusy(false); await refreshRef.current(); } }
  }, []);
  const [actionError, setActionError] = useState("");
  const moveTask = useCallback((task: Task) => {
    void perform(() => moveTaskToTomorrow(task.id), () => {
      setActionError("");
      toast.success("Task moved to tomorrow");
    }).catch(() => setActionError(`Could not move "${task.title}". Check its date and try again.`));
  }, [perform]);
  const toggleTask = useCallback((task: Task) => {
    if (writing.current) return;
    const operation = task.completed_at ? () => reopenTask(task.id) : () => completeTask(task.id);
    void perform(operation, () => {
      if (task.completed_at) { toast.success("Task reopened"); return; }
      toast.success(task.repeat === "none" ? "Task completed" : "Done. Next occurrence added.", { duration: 8000, action: { label: "Undo", onClick: () => {
        void perform(() => reopenTask(task.id)).catch(error => toast.error(error instanceof TaskUndoError ? "The next occurrence has changed. Reopen or edit that task instead." : "Failed to save data.", actionErrorOptions));
      } } });
    }).catch(error => toast.error(error instanceof TaskUndoError ? "The next occurrence has changed. Reopen or edit that task instead." : "Failed to save data.", actionErrorOptions));
  }, [perform]);
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
  const renderTask = useCallback(({ item }: ListRenderItemInfo<Task>) => <TaskCard task={item} today={today} now={reminderNow} reminderIssue={reminderIssue} busy={busy || loading} agenda={mode === "calendar"} onMove={moveTask} onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} />,
    [today, reminderNow, reminderIssue, busy, loading, mode, moveTask, toggleTask, editTask, askDelete]);
  const selectDay = (date: string) => {
    if (date < taskDateKey()) return;
    setSelectedDate(date);
    setMonth(`${date.slice(0, 7)}-01`);
  };
  const move = (direction: number) => {
    const next = moveCalendarDate(week ? selectedDate : month, direction, week);
    const earliest = taskDateKey();
    selectDay(next < earliest ? earliest : next);
  };
  const header = <View>
    {actionError && <Text accessibilityRole="alert" className="py-2 text-sm text-destructive">{actionError}</Text>}
    <View className="mb-4 min-h-[48px] flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="min-w-0 flex-1 text-2xl font-semibold text-foreground">
        {mode === "calendar" ? "Calendar" : "Tasks"}
      </Text>
      {mode === "overview" && (
        <>
          <IconButton className="bg-surface-container-high" icon={searchOpen ? X : Search} accessibilityLabel={searchOpen ? "Close search" : "Search tasks"}
            accessibilityState={{ expanded: searchOpen }} onPress={() => { setSearchOpen(value => !value); setSearch(""); }} />
          <TaskAddButton onPress={() => setEditor({})} disabled={busy} />
        </>
      )}
    </View>
    {mode === "overview" && <>
      {searchOpen && <View className="mb-3 flex-row items-center gap-2 rounded-full border border-border bg-surface px-4"><Search size={16} color={colors.mutedForeground} /><TextInput autoFocus value={search} onChangeText={setSearch} placeholder="Search tasks" accessibilityLabel="Search tasks" placeholderTextColor={colors.mutedForeground} className="min-h-[48px] min-w-0 flex-1 text-base text-foreground" /></View>}
      <TaskFilterBar counts={counts} filter={filter} onFilter={setFilter} />
    </>}
    {mode === "calendar" && <><TaskCalendar days={days} month={month} selected={selectedDate} today={today} counts={dayCounts} week={week} onWeek={setWeek} onMove={move} onToday={() => selectDay(taskDateKey())} onSelect={selectDay} />
      <AgendaHeading title={localTaskDate(selectedDate).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "short" })} onAdd={() => setEditor({})} disabled={busy} />
      <Pressable accessibilityRole="button" accessibilityState={{ selected: showDone }} onPress={() => setShowDone(value => !value)} className="mb-2 min-h-[48px] self-start justify-center rounded-full active:opacity-70"><Text className="text-label-large font-medium text-muted-foreground">{showDone ? "Hide" : "Show"} completed tasks</Text></Pressable>
    </>}
    {reminder && <View className="mb-3 rounded-[24px] border border-outline bg-surface px-3"><View className="flex-row items-center justify-between"><Text className="text-label-large font-semibold text-primary">Task from reminder</Text><IconButton icon={X} accessibilityLabel="Dismiss task from reminder" onPress={() => { reminderId.current = null; setReminder(null); }} /></View><TaskCard task={reminder} today={today} now={reminderNow} reminderIssue={reminderIssue} busy={busy || loading} expanded onMove={moveTask} onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} /></View>}
  </View>;
  const emptyToday = mode === "overview" && filter === "today" && !search.trim() && !debouncedSearch.trim();
  const empty = loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading tasks" className="my-8" />
    : failed ? <View className="items-center gap-3 py-8"><Text className="text-sm text-destructive">Could not load your tasks.</Text><Button label="Retry" onPress={() => void refresh()} /></View>
    : reminder && tasks.length > 0 ? undefined
    : <View className="items-center gap-3 rounded-[24px] border border-border bg-surface px-4 py-8">
      <Text className="text-center text-body-medium text-muted-foreground">{debouncedSearch.trim() ? "No matching tasks" : emptyToday ? "No tasks due today" : "No tasks"}</Text>
      {emptyToday && counts.upcoming > 0 && <Button variant="secondary"
        label={`View ${counts.upcoming} upcoming ${counts.upcoming === 1 ? "task" : "tasks"}`}
        onPress={() => setFilter("upcoming")} />}
    </View>;
  return <>
    <View className="flex-1 bg-background"><View className="w-full max-w-md flex-1 self-center px-5 pt-4">
      <FlatList ref={listRef} data={visible} keyExtractor={keyForTask} renderItem={renderTask} ListHeaderComponent={header} ListEmptyComponent={empty} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} keyboardShouldPersistTaps="handled" contentContainerStyle={CONTENT_STYLE} showsVerticalScrollIndicator={false}
          onEndReached={() => { if (!pagingFailed) void loadMore(); }} onEndReachedThreshold={0.3} ListFooterComponent={paging ? <ActivityIndicator color={colors.primary} accessibilityLabel="Loading more tasks" /> : pagingFailed ? <Button label="Retry loading more" onPress={() => void loadMore()} /> : undefined} />
    </View></View>
    {editor && <TaskEditor task={editor.task} initialDate={mode === "calendar" ? selectedDate : today} onSave={save} onClose={() => setEditor(null)} onDelete={editor.task ? () => setDeletion(editor.task!) : undefined} />}
    <ConfirmDialog visible={deletion !== null} destructive title="Delete task?" message={`Delete “${deletion?.title ?? ""}”? Other occurrences of a recurring task are kept.`} confirmLabel="Delete" onClose={() => setDeletion(null)} onConfirm={async () => { if (deletion) await perform(() => deleteTask(deletion.id), () => { if (editor?.task?.id === deletion.id) setEditor(null); setDeletion(null); }); }} />
  </>;
}
