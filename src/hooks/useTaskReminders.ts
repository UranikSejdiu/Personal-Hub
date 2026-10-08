import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../lib/i18n";
import { observeTaskReminderTaps, syncTaskReminders } from "../lib/taskReminders";
import { subscribeTaskChanges } from "../lib/taskEvents";
import { useModulePreferences } from "../hub/ModulePreferences";

export function useTaskReminders(): void {
  const { t } = useI18n();
  const router = useRouter();
  const { enabledIds, ready } = useModulePreferences();
  const tasksEnabled = enabledIds.includes("tasks");
  useEffect(() => {
    if (!ready) return;
    let active = true;
    let removeTapListener: (() => void) | undefined;
    const refresh = () => {
      void syncTaskReminders(t("tasksReminderChannel")).catch(() => {
        if (active) toast.error(t("tasksReminderFailed"));
      });
    };
    refresh();
    const unsubscribe = subscribeTaskChanges(refresh);
    const appState = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    void observeTaskReminderTaps((taskId) => { if (active && tasksEnabled) router.push({ pathname: "/(tasks)/all", params: { taskId: String(taskId) } }); })
      .then((remove) => { if (active) removeTapListener = remove; else remove(); })
      .catch(() => { if (active) toast.error(t("tasksReminderFailed")); });
    return () => { active = false; unsubscribe(); appState.remove(); removeTapListener?.(); };
  }, [ready, router, t, tasksEnabled]);
}
