import { Text, TextInput } from "../ui/Typography";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeVariables } from "../../lib/theme";
import { formatTaskDate, isTaskInput, taskDateKey } from "../../lib/taskDates";
import { requestTaskReminderPermission, taskReminderDate } from "../../lib/taskReminders";
import type { Task, TaskInput, TaskRepeat } from "../../types/tasks";
import { DatePicker } from "../DatePicker";
import { X, ChevronDown, CalendarDays, Repeat, Bell } from "../AppIcons";
import { Button, IconButton } from "../ui/Button";
import { cn } from "../../lib/utils";
import { ConfirmDialog } from "../ConfirmDialog";
import { ActionDialog } from "../ui/ActionDialog";
import { reminderClock, formatReminderTime } from "../../lib/reminderAccess";
import { ReminderSetup } from "./ReminderSetup";
import { AppAlerts } from "../AppAlerts";

const REPEATS: readonly { value: TaskRepeat; label: string }[] = [
  { value: "none", label: "Never" }, { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function TaskFormDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const variables = useThemeVariables();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" automaticOffset className="flex-1" style={variables}>
        <Pressable onPress={onClose} accessible={false} className="flex-1 items-center justify-end bg-black/40 px-3"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={(event) => event.stopPropagation()} accessible={false} accessibilityViewIsModal
            className="max-h-full w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-surface">
            <View className="flex-row items-center justify-between gap-2 px-4 py-3">
              <Text accessibilityRole="header" className="flex-1 text-2xl font-semibold text-foreground">{title}</Text>
              <IconButton className="bg-surface-container-high" icon={X} accessibilityLabel="Cancel" disabled={busy} onPress={onClose} />
            </View>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
      <AppAlerts />
    </Modal>
  );
}

export function TaskEditor({ task, initialDate = null, onSave, onClose, onDelete }: {
  task?: Task; initialDate?: string | null;
  onSave: (input: TaskInput, id?: number) => Promise<void>; onClose: () => void; onDelete?: () => void;
}) {
  const colors = useThemeColors();
  const [showRepeat, setShowRepeat] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [showSetup, setShowSetup] = useState(false);
  const [dueDate, setDueDate] = useState<string | null>(task ? task.due_date : initialDate);
  const [repeat, setRepeat] = useState<TaskRepeat>(task?.repeat ?? "none");
  const [reminder, setReminder] = useState(task?.reminder_time !== null && task?.reminder_time !== undefined);
  const [time, setTime] = useState(task?.reminder_time ?? "09:00");
  const [showDate, setShowDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; openSettings?: boolean } | null>(null);
  const [discard, setDiscard] = useState(false);
  const initialSnapshot = useRef(JSON.stringify([task?.title ?? "", task?.notes ?? "", task ? task.due_date : initialDate,
    task?.repeat ?? "none", task?.reminder_time ?? null]));
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // The dialog remains mounted during saves; close cannot interrupt a write.
  const discardChanges = () => { if (!busyRef.current) { mountedRef.current = false; onClose(); } };
  const close = () => {
    if (busyRef.current) return;
    const snapshot = JSON.stringify([title, notes, dueDate, repeat, reminder ? time : null]);
    if (snapshot !== initialSnapshot.current) setDiscard(true);
    else discardChanges();
  };

  const changeDate = (date: string | null) => {
    if (busyRef.current || (date !== null && date < taskDateKey())) return;
    setDueDate(date);
    if (date === null) { setRepeat("none"); setReminder(false); }
  };
  const toggleReminder = async (enabled: boolean) => {
    if (busyRef.current || (enabled && !dueDate)) return;
    if (!enabled) { setReminder(false); return; }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await requestTaskReminderPermission("Task reminders");
      if (!mountedRef.current) return;
      if (result === "granted") setReminder(true);
      else setError(result === "denied"
        ? { message: "Notifications are disabled. Enable them in your device settings to use reminders.", openSettings: true }
        : { message: "Reminders require a new native build of Tasks. You can still save and use tasks." });
    } catch {
      if (mountedRef.current) setError({ message: "Tasks are saved, but reminders could not be updated. Open Tasks again to retry." });
    } finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  };
  const save = async () => {
    if (busyRef.current) return;
    const input: TaskInput = { title: title.trim(), notes: notes.trim(), due_date: dueDate, repeat, reminder_time: reminder ? time.trim() : null };
    if (!isTaskInput(input)) { setError({ message: "Enter a task name and check the date, repeat, and reminder settings." }); return; }
    const reminderDate = taskReminderDate(input);
    if (reminderDate && reminderDate.getTime() <= Date.now() && !(task && task.due_date === dueDate && task.reminder_time === input.reminder_time)) { setError({ message: "Choose a future date and time for the reminder." }); return; }
    if (dueDate && dueDate < taskDateKey() && dueDate !== task?.due_date) {
      setError({ message: "Choose today or a future due date." });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try { await onSave(input, task?.id); }
    catch { if (mountedRef.current) setError({ message: "Failed to save data." }); }
    finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  };

  const labelClass = "mb-1 text-label-large font-semibold text-foreground";
  const sectionClass = "gap-1";
  const inputClass = "min-h-[48px] rounded-[20px] border border-outline bg-background px-4 py-2 text-base text-foreground focus:border-primary";
  const today = taskDateKey();
  const tomorrowDate = new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = taskDateKey(tomorrowDate);
  const clock = reminderClock();
  const selectedRepeat = REPEATS.find(option => option.value === repeat)!.label;
  return (
    <><TaskFormDialog title={task ? "Edit task" : "Add task"} busy={busy} onClose={close}>
        <ScrollView className="min-h-0 grow-0 shrink" contentContainerClassName="gap-3 px-4 pb-4" keyboardShouldPersistTaps="handled">
          <View className={sectionClass}><Text accessibilityRole="header" className={labelClass}>Task name</Text>
            <TextInput value={title} onChangeText={setTitle} editable={!busy} maxLength={200} autoFocus={!task}
              placeholder="What needs to be done?" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Task name" className={inputClass} />
          </View>
          <View className={cn(sectionClass, "gap-3")}>
            <Text accessibilityRole="header" className="text-label-large font-semibold text-foreground">Schedule</Text>
            <Pressable disabled={busy} onPress={() => setShowDate(true)} accessibilityRole="button"
              accessibilityLabel="Date (optional)" accessibilityValue={{ text: dueDate ? formatTaskDate(dueDate) : "No due date" }} accessibilityState={{ disabled: busy }}
              className="min-h-[48px] flex-row items-center gap-3 rounded-[20px] border border-border bg-background px-4 py-2 active:opacity-70 disabled:opacity-50">
              <CalendarDays size={19} color={colors.mutedForeground} />
              <View className="min-w-0 flex-1"><Text className="text-label-medium text-muted-foreground">Date</Text>
              <Text className="text-base font-semibold text-foreground">{dueDate ? formatTaskDate(dueDate) : "No due date"}</Text></View>
              <ChevronDown size={16} color={colors.mutedForeground} />
            </Pressable>
            <View className="flex-row flex-wrap gap-2">
              <Button className="min-w-[72px] flex-1" variant={dueDate === today ? "tonal" : "secondary"} label="Today" disabled={busy} accessibilityState={{ selected: dueDate === today }} onPress={() => changeDate(today)} />
              <Button className="min-w-[72px] flex-1" variant={dueDate === tomorrow ? "tonal" : "secondary"} label="Tomorrow" disabled={busy} accessibilityState={{ selected: dueDate === tomorrow }} onPress={() => changeDate(tomorrow)} />
              <Button className="min-w-[72px] flex-1" variant={dueDate === null ? "tonal" : "secondary"} label="No date" disabled={busy} accessibilityState={{ selected: dueDate === null }} onPress={() => changeDate(null)} />
            </View>
            {dueDate !== null && <View className="rounded-[20px] border border-border bg-background px-4">
              <Pressable disabled={busy} onPress={() => setShowRepeat(true)} accessibilityRole="button"
                accessibilityLabel="Repeat" accessibilityValue={{ text: selectedRepeat }} accessibilityState={{ expanded: showRepeat, disabled: busy }}
                className="min-h-[48px] flex-row items-center gap-2 py-2 active:opacity-70 disabled:opacity-50">
                <Repeat size={19} color={colors.mutedForeground} /><Text className="flex-1 text-sm text-foreground">Repeat</Text>
                <Text className="shrink text-sm font-semibold text-foreground">{selectedRepeat}</Text><ChevronDown size={16} color={colors.mutedForeground} />
              </Pressable>
              <View className="min-h-[48px] flex-row items-center gap-2 border-t border-border/60 py-1">
                <Bell size={19} color={colors.mutedForeground} /><Text className="flex-1 text-sm text-foreground">Reminder</Text>
                <Switch value={reminder} onValueChange={(enabled) => void toggleReminder(enabled)} disabled={busy} hitSlop={9}
                  accessibilityLabel="Reminder" accessibilityState={{ checked: reminder, disabled: busy, busy }}
                  trackColor={{ false: colors.muted, true: colors.primary }} thumbColor={reminder ? colors.primaryForeground : colors.outline} />
              </View>
              {reminder && <View className="gap-2 border-t border-border/60 py-3">
                <View className="flex-row items-center justify-between gap-3"><Text className="text-sm text-foreground">Time</Text>
                  {clock ? <Button variant="secondary" label={formatReminderTime(time)} accessibilityLabel={`Reminder time, ${formatReminderTime(time)}`} disabled={busy}
                    onPress={() => {
                      const [hour, minute] = time.split(":").map(Number);
                      void clock.pickTime(hour, minute).then(value => {
                        if (value !== null && mountedRef.current) setTime(value);
                      }).catch(() => { if (mountedRef.current) setError({ message: "Could not open the time picker. Tap the time to retry." }); });
                    }} /> : <TextInput value={time} onChangeText={setTime} editable={!busy} maxLength={5} autoCapitalize="none" autoCorrect={false} selectTextOnFocus
                    placeholder="09:00" placeholderTextColor={colors.mutedForeground} accessibilityLabel="Time (24-hour)" className={cn(inputClass, "w-[104px] text-center font-semibold")} />}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Delivery settings" accessibilityState={{ expanded: showSetup, disabled: busy }} disabled={busy}
                  onPress={() => setShowSetup(value => !value)} className="min-h-[48px] flex-row items-center justify-between gap-3 active:opacity-70">
                  <Text className="text-xs font-medium text-primary">Delivery settings</Text><ChevronDown size={14} color={colors.primary} />
                </Pressable>
                {showSetup && <ReminderSetup />}
              </View>}
            </View>}
          </View>
          <View className={sectionClass}><Text accessibilityRole="header" className={labelClass}>Notes (optional)</Text>
            <TextInput value={notes} onChangeText={setNotes} editable={!busy} multiline maxLength={10000}
              textAlignVertical="top" accessibilityLabel="Notes (optional)" className={cn(inputClass, "min-h-[80px]")} />
          </View>
        </ScrollView>
        <View className="gap-2 border-t border-border px-4 py-3">
          {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error.message}</Text> : null}
          {error?.openSettings && <Button variant="secondary" label="Open app settings" disabled={busy}
            onPress={() => {
              if (busyRef.current) return;
              void Linking.openSettings().catch(() => { if (mountedRef.current) setError({ message: "Couldn’t update reminder settings.", openSettings: true }); });
            }} />}
          <View className="flex-row flex-wrap items-center gap-2">
            {task && onDelete && <Pressable accessibilityRole="button" accessibilityLabel="Delete task?" disabled={busy} className="mr-auto min-h-[48px] justify-center rounded-full px-2 active:opacity-70 disabled:opacity-50" onPress={onDelete}><Text className="text-label-large font-semibold text-destructive">Delete</Text></Pressable>}
            <Button className="min-w-[72px] flex-1" variant="text" label="Cancel" disabled={busy} onPress={close} />
            <Button className="min-w-[72px] flex-1" label="Save" busy={busy} onPress={() => void save()} /></View>
        </View>
      <ActionDialog visible={showRepeat} title="Repeat" layout="list" onClose={() => setShowRepeat(false)}
        actions={REPEATS.map(option => ({ key: option.value, label: option.label, selected: repeat === option.value, disabled: busy, onPress: () => { setRepeat(option.value); setShowRepeat(false); } }))} />
      {showDate ? <DatePicker minimumDate={today} value={dueDate} onChange={changeDate} onClose={() => setShowDate(false)} /> : null}
    </TaskFormDialog>
    <ConfirmDialog visible={discard} destructive title="Discard task changes?" message="Your unsaved changes will be lost."
      confirmLabel="Discard changes" cancelLabel="Keep editing" onConfirm={discardChanges} onClose={() => setDiscard(false)} /></>
  );
}
