import { actionErrorOptions } from "../lib/actionErrorOptions";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { toast } from "sonner-native";
import { observeTaskReminderTaps, syncTaskReminders } from "../lib/taskReminders";
import { subscribeTaskChanges } from "../lib/taskEvents";

export function useTaskReminders(): void {
  const router = useRouter();
  const ready = true;
  const tasksEnabled = true;
  useEffect(() => {
    if (!ready) return;
    let active = true;
    let removeTapListener: (() => void) | undefined;
    const refresh = () => {
      void syncTaskReminders("Task reminders").catch(() => {
        if (active) toast.error("Tasks are saved, but reminders could not be updated. Open Tasks again to retry.", actionErrorOptions);
      });
    };
    refresh();
    const unsubscribe = subscribeTaskChanges(refresh);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    void observeTaskReminderTaps((taskId) => { if (active && tasksEnabled) router.push({ pathname: "/(tasks)", params: { taskId: String(taskId) } }); })
      .then((remove) => { if (active) removeTapListener = remove; else remove(); })
      .catch(() => { if (active) toast.error("Tasks are saved, but reminders could not be updated. Open Tasks again to retry.", actionErrorOptions); });
    return () => { active = false; unsubscribe(); appState.remove(); removeTapListener?.(); };
  }, [ready, router, tasksEnabled]);
}
