import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { loadReminderTasks } from "./tasks";
import type { Task } from "../types/tasks";

type NotificationsApi = typeof import("expo-notifications");
const PREFIX = "personal-hub-task-";
const CHANNEL = "task-reminders";
let notificationsApi: NotificationsApi | null = null;
let syncQueue: Promise<void> = Promise.resolve();

async function getApi(): Promise<NotificationsApi | null> {
  if (Platform.OS === "web" || isRunningInExpoGo() || !requireOptionalNativeModule("ExpoNotificationScheduler")) return null;
  if (!notificationsApi) {
    // Keep this behind the native availability guard. A synchronous module load
    // also avoids fetching a separate Metro chunk when reminders run offline.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api: NotificationsApi = require("expo-notifications");
    api.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    notificationsApi = api;
  }
  return notificationsApi;
}

function allowed(api: NotificationsApi, permission: Awaited<ReturnType<NotificationsApi["getPermissionsAsync"]>>): boolean {
  return permission.granted || permission.ios?.status === api.IosAuthorizationStatus.PROVISIONAL;
}

export async function requestTaskReminderPermission(channelName: string): Promise<"granted" | "denied" | "unavailable"> {
  const api = await getApi();
  if (!api) return "unavailable";
  if (Platform.OS === "android") await api.setNotificationChannelAsync(CHANNEL, { name: channelName, importance: api.AndroidImportance.DEFAULT });
  let permission = await api.getPermissionsAsync();
  if (!allowed(api, permission) && permission.canAskAgain) permission = await api.requestPermissionsAsync();
  return allowed(api, permission) ? "granted" : "denied";
}

export function taskReminderDate(task: Pick<Task, "due_date" | "reminder_time">): Date | null {
  if (!task.due_date || !task.reminder_time) return null;
  return new Date(`${task.due_date}T${task.reminder_time}:00`);
}

/** Reconcile from SQLite after taking the queue, so rapid edits cannot schedule stale reminders. */
export function syncTaskReminders(channelName: string): Promise<void> {
  const next = syncQueue.then(async () => {
    const api = await getApi();
    if (!api) return;
    const tasks = await loadReminderTasks();
    const scheduled = await api.getAllScheduledNotificationsAsync();
    const permission = await api.getPermissionsAsync();
    const reminders = allowed(api, permission) ? tasks.flatMap((task) => {
      const date = taskReminderDate(task);
      return !task.completed_at && date && date.getTime() > Date.now() ? [{ task, date }] : [];
    }).sort((a, b) => a.date.getTime() - b.date.getTime() || a.task.id - b.task.id).slice(0, 50) : [];
    const wanted = new Map(reminders.map(({ task, date }) => [
      `${PREFIX}${task.id}`, { task, date, signature: JSON.stringify([task.title, date.getTime()]) },
    ]));
    const retained = new Set<string>();
    for (const notification of scheduled) {
      if (!notification.identifier.startsWith(PREFIX)) continue;
      const target = wanted.get(notification.identifier);
      if (target && notification.content.data?.signature === target.signature) retained.add(notification.identifier);
      else await api.cancelScheduledNotificationAsync(notification.identifier);
    }
    if (Platform.OS === "android" && wanted.size) await api.setNotificationChannelAsync(CHANNEL, { name: channelName, importance: api.AndroidImportance.DEFAULT });
    for (const [identifier, { task, date, signature }] of wanted) {
      if (retained.has(identifier)) continue;
      await api.scheduleNotificationAsync({ identifier,
        content: { title: channelName, body: task.title, sound: "default", data: { module: "tasks", taskId: task.id, signature } },
        trigger: { type: api.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
      });
    }
  });
  // Callers receive failures; the queue remains usable after one failed sync.
  syncQueue = next.catch(() => undefined);
  return next;
}

export async function observeTaskReminderTaps(onTap: (taskId: number) => void): Promise<() => void> {
  const api = await getApi();
  if (!api) return () => {};
  const handle = (response: import("expo-notifications").NotificationResponse) => {
    const ours = response.notification.request.identifier.startsWith(PREFIX) && response.notification.request.content.data?.module === "tasks";
    const taskId = response.notification.request.content.data?.taskId;
    if (ours && typeof taskId === "number" && Number.isSafeInteger(taskId) && taskId > 0) onTap(taskId);
    return ours;
  };
  const subscription = api.addNotificationResponseReceivedListener((response) => {
    if (handle(response)) void api.clearLastNotificationResponseAsync().catch((error: unknown) => {
      console.warn("[tasks] failed to clear reminder response", error);
    });
  });
  try {
    const response = api.getLastNotificationResponse();
    if (response && handle(response)) await api.clearLastNotificationResponseAsync();
    return () => subscription.remove();
  } catch (error) {
    subscription.remove();
    throw error;
  }
}
