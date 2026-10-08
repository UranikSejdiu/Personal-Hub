import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Pressable, Text, TextInput, View, type ListRenderItemInfo } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../lib/i18n";
import { useThemeColors } from "../../lib/theme";
import { taskDateKey } from "../../lib/taskDates";
import { completeTask, deleteTask, loadTask, loadTasksPage, reopenTask, saveTask, TaskUndoError, type TaskFilter } from "../../lib/tasks";
import { notifyTaskChanges, subscribeTaskChanges } from "../../lib/taskEvents";
import { useHaptics } from "../../hooks/useHaptics";
import type { Task, TaskInput, TaskPriority } from "../../types/tasks";
import { Button, IconButton } from "../ui/Button";
import { Card } from "../ui/Card";
import { Plus, X } from "../AppIcons";
import { ConfirmDialog } from "../ConfirmDialog";
import { TaskEditor } from "./TaskEditor";
import { TaskCard } from "./TaskCard";
import { cn } from "../../lib/utils";

type Filter = Exclude<TaskFilter, "today">;
type Editor = { task?: Task } | null;
const CONTENT_STYLE = { paddingBottom: 120 };

export function TasksScreen({ view }: { view: "today" | "all" }) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [today, setToday] = useState(taskDateKey);
  const [filter, setFilter] = useState<Filter>("active");
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const reminderId = useRef<number | null>(null);
  const listRef = useRef<FlatList<Task>>(null);
  const [completion, setCompletion] = useState<Task | null>(null);
  const [deletion, setDeletion] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [pagingFailed, setPagingFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const sequence = useRef(0);
  const writing = useRef(false);
  const pendingWrite = useRef<Promise<void> | null>(null);
  const page = useRef({ offset: 0, hasMore: false, loading: false });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (reminderTask) listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [reminderTask]);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    page.current = { offset: 0, hasMore: false, loading: true };
    if (focused.current) {
      setTasks([]); setLoading(true); setFailed(false); setPaging(false); setPagingFailed(false);
    }
    try {
      await pendingWrite.current;
      const date = taskDateKey();
      const targetId = reminderId.current;
      const [result, target] = await Promise.all([
        loadTasksPage({ filter: view === "today" ? "today" : filter, today: date, priority, search }),
        targetId === null ? Promise.resolve(undefined) : loadTask(targetId),
      ]);
      if (!focused.current || request !== sequence.current) return;
      page.current = { offset: result.nextOffset, hasMore: result.hasMore, loading: false };
      setTasks(result.tasks);
      setToday(date);
      if (targetId !== null && targetId === reminderId.current) setReminderTask(target ?? null);
    } catch {
      if (focused.current && request === sequence.current) { setFailed(true); toast.error(t("errorLoadingData")); }
    } finally {
      if (focused.current && request === sequence.current) { page.current.loading = false; setLoading(false); }
    }
  }, [filter, priority, search, t, view]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
    if (focused.current) void refresh();
  }, [refresh]);

  // Filtering refreshes the list without resetting open dialogs or focus listeners.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(writing.current);
    void refreshRef.current();
    notifyTaskChanges();
    const unsubscribe = subscribeTaskChanges(() => { void refreshRef.current(); });
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refreshRef.current(); });
    let midnight: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnight = setTimeout(() => { void refreshRef.current(); scheduleMidnight(); }, next.getTime() - now.getTime());
    };
    scheduleMidnight();
    return () => {
      focused.current = false; ++sequence.current;
      unsubscribe(); subscription.remove(); clearTimeout(midnight);
      setEditor(null); setCompletion(null); setDeletion(null);
    };
  }, []));

  useEffect(() => {
    if (view !== "all" || !taskId) return;
    let active = true;
    const id = Number(taskId);
    void (async () => {
      try {
        const task = Number.isSafeInteger(id) && id > 0 ? await loadTask(id) : undefined;
        if (!active) return;
        reminderId.current = task?.id ?? null;
        setReminderTask(task ?? null);
        if (!task) toast.error(t("tasksReminderMissing"));
        router.setParams({ taskId: undefined });
      } catch {
        if (active) toast.error(t("errorLoadingData"));
      }
    })();
    return () => { active = false; };
  }, [router, t, taskId, view]);

  const loadMore = useCallback(async () => {
    if (!focused.current || writing.current || page.current.loading || !page.current.hasMore) return;
    const request = sequence.current;
    const offset = page.current.offset;
    page.current.loading = true;
    setPaging(true); setPagingFailed(false);
    try {
      const result = await loadTasksPage({ filter: view === "today" ? "today" : filter, today, priority, search, offset });
      if (!focused.current || request !== sequence.current) return;
      page.current = { offset: result.nextOffset, hasMore: result.hasMore, loading: false };
      setTasks((current) => [...current, ...result.tasks]);
    } catch {
      if (focused.current && request === sequence.current) setPagingFailed(true);
    } finally {
      if (focused.current && request === sequence.current) { page.current.loading = false; setPaging(false); }
    }
  }, [filter, priority, search, today, view]);

  const perform = useCallback(async (operation: () => Promise<void>, onCommitted?: () => void) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    ++sequence.current;
    const promise = operation();
    pendingWrite.current = promise.catch(() => undefined);
    try {
      await promise;
      void haptics.light();
      if (focused.current) onCommitted?.();
    } finally {
      writing.current = false;
      pendingWrite.current = null;
      if (focused.current) setBusy(false);
      if (focused.current) await refreshRef.current();
    }
  }, [haptics]);

  const toggleTask = useCallback((task: Task) => {
    if (writing.current) return;
    if (task.completed_at === null) { setCompletion(task); return; }
    void perform(() => reopenTask(task.id))
      .catch((error: unknown) => toast.error(t(error instanceof TaskUndoError ? "tasksUndoBlocked" : "errorSavingData")));
  }, [perform, t]);
  const editTask = useCallback((task: Task) => setEditor({ task }), []);
  const askDelete = useCallback((task: Task) => setDeletion(task), []);
  const handleTaskSave = async (input: TaskInput, id?: number) => {
    await perform(async () => { await saveTask(input, id); }, () => setEditor(null));
  };
  const confirmComplete = async () => {
    if (!completion) return;
    await perform(() => completeTask(completion.id), () => {
      setCompletion(null);
      if (completion.repeat !== "none") toast.success(t("tasksNextCreated"));
    });
  };
  const confirmDelete = async () => {
    if (!deletion) return;
    await perform(() => deleteTask(deletion.id), () => setDeletion(null));
  };

  const filters = useMemo(() => [{ id: "active" as const, label: t("tasksOpen") },
    { id: "upcoming" as const, label: t("tasksUpcoming") }, { id: "undated" as const, label: t("tasksUndated") },
    { id: "completed" as const, label: t("tasksCompleted") }], [t]);
  const priorities = useMemo(() => [{ id: null, label: t("tasksPriorityAll") },
    { id: 2 as const, label: t("tasksPriorityHigh") }, { id: 1 as const, label: t("tasksPriorityMedium") },
    { id: 0 as const, label: t("tasksPriorityNormal") }], [t]);
  const renderTask = useCallback(({ item }: ListRenderItemInfo<Task>) => <TaskCard task={item}
    today={today} busy={busy || loading} onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} />,
  [askDelete, busy, editTask, loading, today, toggleTask]);
  const narrowed = search !== "" || priority !== null || filter === "upcoming" || filter === "undated";

  return <>
    <View className="flex-1 bg-background"><View className="w-full max-w-md flex-1 self-center px-4 pt-3">
      <View className="mb-3 gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t(view === "today" ? "tasksToday" : "tasksAll")}</Text>
          <Button icon={Plus} label={t("tasksAdd")} disabled={busy || loading || failed} onPress={() => setEditor({})} />
        </View>
        <Text className="text-sm text-muted-foreground">{t(view === "today" ? "tasksTodayHint" : "tasksAllHint")}</Text>
        <View className="flex-row items-center rounded-xl border border-border bg-card">
          <TextInput value={searchInput} onChangeText={setSearchInput} editable={!busy} placeholder={t("tasksSearch")}
            placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("tasksSearch")} autoCorrect={false}
            className="min-h-[44px] min-w-0 flex-1 px-3 text-base text-foreground" />
          {searchInput ? <IconButton icon={X} accessibilityLabel={t("clear")} disabled={busy}
            onPress={() => { setSearchInput(""); setSearch(""); }} /> : null}
        </View>
      </View>
      {view === "all" ? <FlatList data={filters} horizontal keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false}
        className="mb-2 grow-0" contentContainerClassName="gap-2 py-1"
        renderItem={({ item }) => <Pressable onPress={() => setFilter(item.id)} disabled={busy} accessible accessibilityRole="radio"
          accessibilityLabel={item.label} accessibilityState={{ checked: filter === item.id, disabled: busy }}
          className={cn("min-h-[44px] justify-center rounded-xl border px-3 py-2 active:opacity-70", filter === item.id ? "border-primary bg-primary/10" : "border-border bg-card")}>
          <Text className={cn("text-sm font-medium", filter === item.id ? "text-primary" : "text-muted-foreground")}>{item.label}</Text>
        </Pressable>} /> : null}
      <FlatList data={priorities} horizontal keyExtractor={(item) => String(item.id)} showsHorizontalScrollIndicator={false}
        className="mb-3 grow-0" contentContainerClassName="gap-2 py-1"
        renderItem={({ item }) => <Pressable onPress={() => setPriority(item.id)} disabled={busy} accessible accessibilityRole="radio"
          accessibilityLabel={item.label} accessibilityState={{ checked: priority === item.id, disabled: busy }}
          className={cn("min-h-[44px] justify-center rounded-xl border px-3 py-2 active:opacity-70", priority === item.id ? "border-primary bg-primary/10" : "border-border bg-card")}>
          <Text className={cn("text-sm font-medium", priority === item.id ? "text-primary" : "text-muted-foreground")}>{item.label}</Text>
        </Pressable>} />
      <FlatList ref={listRef} data={failed ? [] : tasks.filter((task) => task.id !== reminderTask?.id)} keyExtractor={(task) => String(task.id)} renderItem={renderTask} className="flex-1"
        contentContainerStyle={CONTENT_STYLE} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        onEndReached={() => { if (!pagingFailed) void loadMore(); }} onEndReachedThreshold={0.3}
        ListHeaderComponent={reminderTask ? <View className="mb-3 rounded-xl border border-primary p-2">
          <View className="flex-row items-center justify-between"><Text className="flex-1 text-sm font-semibold text-primary">{t("tasksReminderOpen")}</Text>
            <IconButton icon={X} accessibilityLabel={t("tasksDismissReminder")} onPress={() => { reminderId.current = null; setReminderTask(null); }} /></View>
          <TaskCard task={reminderTask} today={today} busy={busy || loading} expanded onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} />
        </View> : null}
        ListFooterComponent={paging ? <ActivityIndicator color={colors.primary} accessibilityLabel={t("loading")} />
          : pagingFailed ? <View className="items-center gap-2 py-3"><Text className="text-sm text-destructive">{t("errorLoadingData")}</Text>
            <Button label={t("retry")} onPress={() => void loadMore()} /></View> : null}
        ListEmptyComponent={loading ? <View className="items-center py-12"><ActivityIndicator color={colors.primary} accessibilityLabel={t("loading")} /></View>
          : failed ? <Card className="items-center gap-3 py-8"><Text className="text-sm text-muted-foreground">{t("errorLoadingData")}</Text><Button variant="secondary" label={t("retry")} onPress={() => void refresh()} /></Card>
          : reminderTask && tasks.length > 0 ? null : <Card className="items-center gap-3 px-4 py-8"><Text className="text-center text-base font-semibold text-foreground">{t(narrowed ? "tasksNoMatches" : view === "today" ? "tasksEmptyToday" : filter === "completed" ? "tasksEmptyCompleted" : "tasksEmpty")}</Text>
            <Text className="text-center text-sm text-muted-foreground">{t(narrowed ? "tasksNoMatchesHint" : view === "today" ? "tasksEmptyTodayHint" : "tasksEmptyHint")}</Text></Card>} />
    </View></View>
    {editor ? <TaskEditor task={editor.task} initialDate={view === "today" ? today : null}
      onSave={handleTaskSave} onClose={() => setEditor(null)} /> : null}
    <ConfirmDialog visible={completion !== null} title={t("tasksCompleteTitle")}
      message={t(completion && completion.repeat !== "none" ? "tasksCompleteRepeatBody" : "tasksCompleteBody", { name: completion?.title ?? "" })}
      confirmLabel={t("tasksComplete")} onConfirm={confirmComplete} onClose={() => setCompletion(null)} />
    <ConfirmDialog visible={deletion !== null} destructive title={t("tasksDeleteTitle")}
      message={t("tasksDeleteBody", { name: deletion?.title ?? "" })}
      confirmLabel={t("delete")} onConfirm={confirmDelete} onClose={() => setDeletion(null)} />
  </>;
}
