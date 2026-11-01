import { Text, TextInput } from "../ui/Typography";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Switch, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n, type TKey } from "../../lib/i18n";
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
import { ReminderSetup } from "./ReminderSetup";

const REPEATS: readonly { value: TaskRepeat; key: TKey }[] = [
  { value: "none", key: "tasksRepeatNone" }, { value: "daily", key: "tasksRepeatDaily" },
  { value: "weekly", key: "tasksRepeatWeekly" }, { value: "monthly", key: "tasksRepeatMonthly" },
  { value: "yearly", key: "tasksRepeatYearly" },
];

function TaskFormDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const variables = useThemeVariables();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" automaticOffset className="flex-1" style={variables}>
        <Pressable onPress={onClose} accessible={false} className="flex-1 items-center justify-end bg-black/40 px-3"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={(event) => event.stopPropagation()} accessible={false} accessibilityViewIsModal
            className="max-h-full w-full max-w-md overflow-hidden rounded-[22px] border border-border bg-background">
            <View className="flex-row items-center justify-between border-b border-border/60 bg-card px-[18px] py-2.5">
              <Text accessibilityRole="header" className="flex-1 text-[22px] font-semibold text-foreground">{title}</Text>
              <IconButton icon={X} accessibilityLabel={t("cancel")} disabled={busy} onPress={onClose} />
            </View>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function TaskEditor({ task, initialDate = null, onSave, onClose, onDelete }: {
  task?: Task; initialDate?: string | null;
  onSave: (input: TaskInput, id?: number) => Promise<void>; onClose: () => void; onDelete?: () => void;
}) {
  const { t } = useI18n();
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
  const [error, setError] = useState<string | null>(null);
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
    if (busyRef.current) return;
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
      const result = await requestTaskReminderPermission(t("tasksReminderChannel"));
      if (!mountedRef.current) return;
      if (result === "granted") setReminder(true);
      else setError(t(result === "denied" ? "tasksReminderDenied" : "tasksReminderBuild"));
    } catch {
      if (mountedRef.current) setError(t("tasksReminderFailed"));
    } finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  };
  const save = async () => {
    if (busyRef.current) return;
    const input: TaskInput = { title: title.trim(), notes: notes.trim(), due_date: dueDate, repeat, reminder_time: reminder ? time.trim() : null };
    if (!isTaskInput(input)) { setError(t("tasksInvalid")); return; }
    const reminderDate = taskReminderDate(input);
    if (reminderDate && reminderDate.getTime() <= Date.now() && !(task && task.due_date === dueDate && task.reminder_time === input.reminder_time)) { setError(t("tasksReminderPast")); return; }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try { await onSave(input, task?.id); }
    catch { if (mountedRef.current) setError(t("errorSavingData")); }
    finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  };

  const labelClass = "mb-[7px] text-[13px] font-semibold text-foreground";
  const sectionClass = "rounded-[18px] border border-border/60 bg-card p-[14px]";
  const inputClass = "min-h-[48px] rounded-[14px] border border-border/60 bg-background px-3 py-3 text-base text-foreground";
  const today = taskDateKey();
  const tomorrowDate = new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = taskDateKey(tomorrowDate);
  const selectedRepeat = t(REPEATS.find(option => option.value === repeat)!.key);
  return (
    <><TaskFormDialog title={t(task ? "tasksEdit" : "tasksAdd")} busy={busy} onClose={close}>
        <ScrollView className="grow-0 shrink" contentContainerClassName="gap-[12px] p-[14px]" keyboardShouldPersistTaps="handled">
          <View className={sectionClass}><Text accessibilityRole="header" className={labelClass}>{t("tasksTitle")}</Text>
            <TextInput value={title} onChangeText={setTitle} editable={!busy} maxLength={200} autoFocus={!task}
              placeholder={t("tasksTitlePlaceholder")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("tasksTitle")} className={inputClass} />
          </View>
          <View className={cn(sectionClass, "gap-3")}>
            <Text accessibilityRole="header" className="text-[13px] font-semibold text-foreground">{t("tasksSchedule")}</Text>
            <Pressable disabled={busy} onPress={() => setShowDate(true)} accessibilityRole="button"
              accessibilityLabel={t("tasksDue")} accessibilityValue={{ text: dueDate ? formatTaskDate(dueDate) : t("tasksNoDate") }} accessibilityState={{ disabled: busy }}
              className="min-h-[52px] flex-row items-center gap-3 rounded-[13px] border border-border/60 bg-background px-3 py-3 active:opacity-70 disabled:opacity-50">
              <CalendarDays size={19} color={colors.primary} /><Text className="text-sm text-muted-foreground">{t("tasksDateLabel")}</Text>
              <Text numberOfLines={1} className="min-w-0 flex-1 text-right text-sm font-semibold text-foreground">{dueDate ? formatTaskDate(dueDate) : t("tasksNoDate")}</Text><ChevronDown size={16} color={colors.mutedForeground} />
            </Pressable>
            <View className="flex-row gap-2">
              <Button className="min-w-0 flex-1" variant={dueDate === today ? "primary" : "secondary"} label={t("tasksToday")} disabled={busy} accessibilityState={{ selected: dueDate === today }} onPress={() => changeDate(today)} />
              <Button className="min-w-0 flex-1" variant={dueDate === tomorrow ? "primary" : "secondary"} label={t("tasksTomorrow")} disabled={busy} accessibilityState={{ selected: dueDate === tomorrow }} onPress={() => changeDate(tomorrow)} />
              <Button className="min-w-0 flex-1" variant={dueDate === null ? "primary" : "secondary"} label={t("tasksNoDate")} disabled={busy} accessibilityState={{ selected: dueDate === null }} onPress={() => changeDate(null)} />
            </View>
            <View className="rounded-[13px] border border-border/60 bg-background px-3">
              <Pressable disabled={busy || !dueDate} onPress={() => setShowRepeat(true)} accessibilityRole="button"
                accessibilityLabel={t("tasksRepeat")} accessibilityValue={{ text: selectedRepeat }} accessibilityState={{ expanded: showRepeat, disabled: busy || !dueDate }}
                className="min-h-[52px] flex-row items-center gap-3 py-3 active:opacity-70 disabled:opacity-50">
                <Repeat size={19} color={colors.mutedForeground} /><Text className="flex-1 text-sm text-foreground">{t("tasksRepeat")}</Text>
                <Text className="shrink text-sm font-semibold text-foreground">{selectedRepeat}</Text><ChevronDown size={16} color={colors.mutedForeground} />
              </Pressable>
              <View className="min-h-[52px] flex-row items-center gap-3 border-t border-border/60 py-2">
                <Bell size={19} color={colors.mutedForeground} /><Text className="flex-1 text-sm text-foreground">{t("tasksReminder")}</Text>
                <Switch value={reminder} onValueChange={(enabled) => void toggleReminder(enabled)} disabled={busy || !dueDate} hitSlop={9}
                  accessibilityLabel={t("tasksReminder")} accessibilityState={{ checked: reminder, disabled: busy || !dueDate, busy }}
                  trackColor={{ false: colors.input, true: colors.primary }} thumbColor={reminder ? colors.primaryForeground : colors.mutedForeground} />
              </View>
              {reminder && dueDate ? <View className="gap-2 border-t border-border/60 py-3">
                <View className="flex-row items-center justify-between gap-3"><Text className="text-sm text-foreground">{t("tasksTimeLabel")}</Text>
                  <TextInput value={time} onChangeText={setTime} editable={!busy} maxLength={5} autoCapitalize="none" autoCorrect={false} selectTextOnFocus
                    placeholder="09:00" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("tasksReminderTime")} className={cn(inputClass, "w-[104px] text-center font-semibold")} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={t("tasksDeliverySettings")} accessibilityState={{ expanded: showSetup, disabled: busy }} disabled={busy}
                  onPress={() => setShowSetup(value => !value)} className="min-h-[44px] flex-row items-center justify-between gap-3 active:opacity-70">
                  <Text className="text-xs font-medium text-primary">{t("tasksDeliverySettings")}</Text><ChevronDown size={14} color={colors.primary} />
                </Pressable>
                {showSetup && <ReminderSetup />}
              </View> : null}
            </View>
            {!dueDate && <Text className="text-xs text-muted-foreground">{t("tasksScheduleNeedsDate")}</Text>}
            {repeat !== "none" && <Text className="text-xs text-muted-foreground">{t("tasksRepeatHint")}</Text>}
          </View>
          <View className={sectionClass}><Text accessibilityRole="header" className={labelClass}>{t("tasksNotes")}</Text>
            <TextInput value={notes} onChangeText={setNotes} editable={!busy} multiline maxLength={10000}
              textAlignVertical="top" accessibilityLabel={t("tasksNotes")} className={cn(inputClass, "min-h-[80px]")} />
          </View>
        </ScrollView>
        <View className="gap-2 border-t border-border/60 bg-card px-[18px] py-3">
          {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
          <View className="flex-row items-center gap-2">
            {task && onDelete && <Pressable accessibilityRole="button" accessibilityLabel={t("tasksDeleteTitle")} disabled={busy} className="mr-auto min-h-[44px] justify-center rounded-[11px] disabled:opacity-50" onPress={onDelete}><Text className="text-xs font-semibold text-destructive">{t("delete")}</Text></Pressable>}
            <Button className="flex-1" variant="secondary" label={t("cancel")} disabled={busy} onPress={close} />
            <Button className="flex-1" label={t("save")} busy={busy} onPress={() => void save()} /></View>
        </View>
      <ActionDialog visible={showRepeat} title={t("tasksRepeat")} layout="list" onClose={() => setShowRepeat(false)}
        actions={REPEATS.map(option => ({ key: option.value, label: t(option.key), selected: repeat === option.value, disabled: busy, onPress: () => { setRepeat(option.value); setShowRepeat(false); } }))} />
      {showDate ? <DatePicker value={dueDate} onChange={changeDate} onClose={() => setShowDate(false)} /> : null}
    </TaskFormDialog>
    <ConfirmDialog visible={discard} destructive title={t("tasksDiscardTitle")} message={t("tasksDiscardBody")}
      confirmLabel={t("discard")} cancelLabel={t("keepEditing")} onConfirm={discardChanges} onClose={() => setDiscard(false)} /></>
  );
}
