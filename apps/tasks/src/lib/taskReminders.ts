import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { loadReminderTasks } from "./tasks";
import type { Task } from "../types/tasks";
import { getReminderAccess, openReminderSettings } from "./reminderAccess";

type NotificationsApi = typeof import("expo-notifications");
const PREFIX = "personal-hub-task-";
const CHANNEL = "task-reminders";
let notificationsApi: NotificationsApi | null = null;
let syncInProgress: Promise<void> | null = null;
let requestedSync = 0;
let latestChannelName = '';

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
  if (Platform.OS === "android" && permission.status === "denied") return false;
  return permission.granted || permission.ios?.status === api.IosAuthorizationStatus.PROVISIONAL;
}

function hasAndroidChannels(): boolean {
  return Platform.OS === "android" && Number(Platform.Version) >= 26;
}

async function ensureReminderChannel(api: NotificationsApi, name: string): Promise<void> {
  if (hasAndroidChannels()) {
    await api.setNotificationChannelAsync(CHANNEL, {
      name, importance: api.AndroidImportance.DEFAULT, enableVibrate: true,
    });
  }
}

async function isReminderChannelEnabled(api: NotificationsApi): Promise<boolean> {
  if (!hasAndroidChannels()) return true;
  const channel = await api.getNotificationChannelAsync(CHANNEL);
  return channel?.importance !== api.AndroidImportance.NONE;
}

export async function openTaskReminderChannelSettings(channelName: string): Promise<void> {
  const api = await getApi();
  if (!api || !hasAndroidChannels()) return;
  await ensureReminderChannel(api, channelName);
  await openReminderSettings("notifications", CHANNEL);
}

export async function requestTaskReminderPermission(channelName: string): Promise<"granted" | "denied" | "unavailable"> {
  const api = await getApi();
  if (!api) return "unavailable";
  await ensureReminderChannel(api, channelName);
  let permission = await api.getPermissionsAsync();
  if (!allowed(api, permission) && permission.canAskAgain) permission = await api.requestPermissionsAsync();
  return allowed(api, permission) && await isReminderChannelEnabled(api) ? "granted" : "denied";
}

export async function taskReminderNotificationsEnabled(): Promise<boolean | null> {
  const api = await getApi();
  if (!api) return null;
  if (!allowed(api, await api.getPermissionsAsync())) return false;
  return isReminderChannelEnabled(api);
}

export type TaskReminderIssue = "notifications" | "channel" | "battery" | "alarms";

export async function getTaskReminderIssue(): Promise<TaskReminderIssue | null> {
  if (Platform.OS !== "android") return null;
  const api = await getApi();
  if (!api) return null;
  if (!allowed(api, await api.getPermissionsAsync())) return "notifications";
  if (!await isReminderChannelEnabled(api)) return "channel";
  const access = getReminderAccess();
  if (access?.backgroundRestricted) return "battery";
  if (Number(Platform.Version) >= 31 && access?.exactAlarms === false) return "alarms";
  return null;
}

export async function openTaskReminderIssueSettings(issue: TaskReminderIssue): Promise<void> {
  if (issue === "channel") await openTaskReminderChannelSettings("Task reminders");
  else await openReminderSettings(issue);
}

export function taskReminderDate(task: Pick<Task, "due_date" | "reminder_time">): Date | null {
  if (!task.due_date || !task.reminder_time) return null;
  return new Date(`${task.due_date}T${task.reminder_time}:00`);
}

export function upcomingTaskReminder(task: Task, now: number): Date | null {
  const date = task.completed_at === null ? taskReminderDate(task) : null;
  return date && date.getTime() > now ? date : null;
}

/** Reconcile from SQLite after taking the queue, so rapid edits cannot schedule stale reminders. */
export function syncTaskReminders(channelName: string): Promise<void> {
  requestedSync++;
  latestChannelName = channelName;
  if (syncInProgress) return syncInProgress;
  // Combine a burst into one pass. Requests received during a pass require
  // one follow-up with the latest database state, rather than a queued pass
  // for every edit. Native scheduled reminders remain unchanged if current.
  syncInProgress = Promise.resolve().then(async () => {
    try {
      while (true) {
        const generation = requestedSync;
        await reconcileTaskReminders(latestChannelName);
        if (generation === requestedSync) {
          syncInProgress = null;
          return;
        }
      }
    } catch (error) {
      syncInProgress = null;
      throw error;
    }
  });
  return syncInProgress;
}

async function reconcileTaskReminders(channelName: string): Promise<void> {
  const api = await getApi();
  if (!api) return;
  const tasks = await loadReminderTasks();
  const scheduled = await api.getAllScheduledNotificationsAsync();
  const permission = await api.getPermissionsAsync();
  // Access can change while the app is closed. A new signature replaces any
  // retained inexact alarms when the user grants precise delivery access.
  const exactAlarms = getReminderAccess()?.exactAlarms ?? false;
  const legacyVibration = Platform.OS === "android" && !hasAndroidChannels();
  const now = Date.now();
  const reminders = allowed(api, permission) ? tasks.flatMap((task) => {
    const date = upcomingTaskReminder(task, now);
    return date ? [{ task, date }] : [];
  }).sort((a, b) => a.date.getTime() - b.date.getTime() || a.task.id - b.task.id).slice(0, Platform.OS === "ios" ? 50 : undefined) : [];
  const wanted = new Map(reminders.map(({ task, date }) => [
    `${PREFIX}${task.id}`, { task, date, signature: JSON.stringify(
      legacyVibration ? [task.title, date.getTime(), exactAlarms, "vibration"] : [task.title, date.getTime(), exactAlarms],
    ) },
  ]));
  const retained = new Set<string>();
  for (const notification of scheduled) {
    if (!notification.identifier.startsWith(PREFIX)) continue;
    const target = wanted.get(notification.identifier);
    if (target && notification.content.data?.signature === target.signature) retained.add(notification.identifier);
    else await api.cancelScheduledNotificationAsync(notification.identifier);
  }
  if (wanted.size) await ensureReminderChannel(api, channelName);
  for (const [identifier, { task, date, signature }] of wanted) {
    if (retained.has(identifier)) continue;
    await api.scheduleNotificationAsync({ identifier,
      content: {
        title: channelName,
        body: task.title,
        sound: "default",
        ...(legacyVibration ? { vibrate: [0, 250] } : {}),
        data: { module: "tasks", taskId: task.id, signature },
      },
      trigger: { type: api.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
    });
  }

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
