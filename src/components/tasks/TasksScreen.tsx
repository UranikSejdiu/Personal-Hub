import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Pressable, Text, View, type ListRenderItemInfo } from "react-native";
import { useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../lib/i18n";
import { useThemeColors } from "../../lib/theme";
import { taskDateKey } from "../../lib/taskDates";
import { completeTask, deleteTask, loadTasks, reopenTask, saveTask, TaskUndoError } from "../../lib/tasks";
import { notifyTaskChanges, subscribeTaskChanges } from "../../lib/taskEvents";
import { useHaptics } from "../../hooks/useHaptics";
import type { Task, TaskInput } from "../../types/tasks";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Plus } from "../AppIcons";
import { ConfirmDialog } from "../ConfirmDialog";
import { TaskEditor } from "./TaskEditor";
import { TaskCard } from "./TaskCard";
import { cn } from "../../lib/utils";

type Filter = "active" | "completed";
type Editor = { task?: Task } | null;
const CONTENT_STYLE = { paddingBottom: 120 };

export function TasksScreen({ view }: { view: "today" | "all" }) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [today, setToday] = useState(taskDateKey);
  const [filter, setFilter] = useState<Filter>("active");
  const [editor, setEditor] = useState<Editor>(null);
  const [deletion, setDeletion] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const sequence = useRef(0);
  const writing = useRef(false);
  const pendingWrite = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (focused.current) { setLoading(true); setFailed(false); }
    try {
      await pendingWrite.current;
      const nextTasks = await loadTasks();
      if (!focused.current || request !== sequence.current) return;
      setTasks(nextTasks);
      setToday(taskDateKey());
    } catch {
      if (focused.current && request === sequence.current) { setFailed(true); toast.error(t("errorLoadingData")); }
    } finally { if (focused.current && request === sequence.current) setLoading(false); }
  }, [t]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(writing.current);
    void refresh();
    notifyTaskChanges();
    const unsubscribe = subscribeTaskChanges(() => { void refresh(); });
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    let midnight: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnight = setTimeout(() => { void refresh(); scheduleMidnight(); }, next.getTime() - now.getTime());
    };
    scheduleMidnight();
    return () => { focused.current = false; ++sequence.current; unsubscribe(); subscription.remove(); clearTimeout(midnight); setEditor(null); setDeletion(null); };
  }, [refresh]));

  const perform = useCallback(async (operation: () => Promise<void>, onCommitted?: () => void) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    ++sequence.current;
    const promise = operation();
    // Refresh waits for persistence but does not report a write failure as a read failure.
    pendingWrite.current = promise.catch(() => undefined);
    try {
      await promise;
      void haptics.light();
      if (focused.current) onCommitted?.();
    } finally {
      writing.current = false;
      pendingWrite.current = null;
      if (focused.current) setBusy(false);
    }
    if (focused.current) await refresh();
  }, [haptics, refresh]);

  const toggleTask = useCallback((task: Task) => {
    void perform(() => task.completed_at ? reopenTask(task.id) : completeTask(task.id), () => {
      if (!task.completed_at && task.repeat !== "none") toast.success(t("tasksNextCreated"));
    }).catch((error: unknown) => toast.error(t(error instanceof TaskUndoError ? "tasksUndoBlocked" : "errorSavingData")));
  }, [perform, t]);
  const editTask = useCallback((task: Task) => setEditor({ task }), []);
  const askDelete = useCallback((task: Task) => setDeletion(task), []);
  const handleTaskSave = async (input: TaskInput, id?: number) => {
    await perform(async () => { await saveTask(input, id); }, () => setEditor(null));
  };
  const confirmDelete = async () => {
    if (!deletion) return;
    await perform(() => deleteTask(deletion.id), () => setDeletion(null));
  };

  const visible = useMemo(() => tasks.filter((task) => {
    if (view === "today") return !task.completed_at && task.due_date !== null && task.due_date <= today;
    if (filter === "completed") return task.completed_at !== null;
    return !task.completed_at;
  }), [tasks, view, filter, today]);
  const filters = useMemo(() => [{ id: "active" as const, label: t("tasksOpen") },
    { id: "completed" as const, label: t("tasksCompleted") }], [t]);
  const renderTask = useCallback(({ item }: ListRenderItemInfo<Task>) => <TaskCard task={item}
    today={today} busy={busy || loading} onToggle={toggleTask} onEdit={editTask} onDelete={askDelete} />,
  [askDelete, busy, editTask, loading, today, toggleTask]);

  return <>
    <View className="flex-1 bg-background"><View className="w-full max-w-md flex-1 self-center px-4 pt-3">
      <View className="mb-3 gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text accessibilityRole="header" className="text-xl font-bold text-foreground">{t(view === "today" ? "tasksToday" : "tasksAll")}</Text>
          <Button icon={Plus} label={t("tasksAdd")} disabled={busy || loading || failed} onPress={() => setEditor({})} />
        </View>
        <Text className="text-sm text-muted-foreground">{t(view === "today" ? "tasksTodayHint" : "tasksAllHint")}</Text>
      </View>
      {view === "all" ? <>
        <FlatList data={filters} horizontal keyExtractor={(item) => String(item.id)} showsHorizontalScrollIndicator={false}
          className="mb-3 grow-0" contentContainerClassName="gap-2 py-1"
          renderItem={({ item }) => <Pressable onPress={() => setFilter(item.id)} disabled={busy} accessible accessibilityRole="radio"
            accessibilityLabel={item.label} accessibilityState={{ checked: filter === item.id, disabled: busy }}
            className={cn("min-h-[44px] justify-center rounded-xl border px-3 py-2 active:opacity-70", filter === item.id ? "border-primary bg-primary/10" : "border-border bg-card")}>
            <Text className={cn("text-sm font-medium", filter === item.id ? "text-primary" : "text-muted-foreground")}>{item.label}</Text>
          </Pressable>} />
      </> : null}
      <FlatList data={failed ? [] : visible} keyExtractor={(task) => String(task.id)} renderItem={renderTask} className="flex-1"
        contentContainerStyle={CONTENT_STYLE} showsVerticalScrollIndicator={false}
        ListEmptyComponent={loading ? <View className="items-center py-12"><ActivityIndicator color={colors.primary} accessibilityLabel={t("loading")} /></View>
          : failed ? <Card className="items-center gap-3 py-8"><Text className="text-sm text-muted-foreground">{t("errorLoadingData")}</Text><Button variant="secondary" label={t("retry")} onPress={() => void refresh()} /></Card>
          : <Card className="items-center gap-3 px-4 py-8"><Text className="text-center text-base font-semibold text-foreground">{t(view === "today" ? "tasksEmptyToday" : filter === "completed" ? "tasksEmptyCompleted" : "tasksEmpty")}</Text>
            <Text className="text-center text-sm text-muted-foreground">{t(view === "today" ? "tasksEmptyTodayHint" : "tasksEmptyHint")}</Text></Card>} />
    </View></View>
    {editor ? <TaskEditor task={editor.task}
      initialDate={view === "today" ? today : null}
      onSave={handleTaskSave} onClose={() => setEditor(null)} /> : null}
    <ConfirmDialog visible={deletion !== null} destructive title={t("tasksDeleteTitle")}
      message={t("tasksDeleteBody", { name: deletion?.title ?? "" })}
      confirmLabel={t("delete")} onConfirm={confirmDelete} onClose={() => setDeletion(null)} />
  </>;
}
