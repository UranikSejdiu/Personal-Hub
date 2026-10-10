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
import { X, ChevronDown, CalendarDays } from "../AppIcons";
import { Button, IconButton } from "../ui/Button";
import { cn } from "../../lib/utils";
import { ConfirmDialog } from "../ConfirmDialog";
import { AnchoredMenu, useAnchoredMenu } from "../ui/AnchoredMenu";

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
        <Pressable onPress={onClose} accessible={false} className="flex-1 items-center justify-center bg-black/50 px-4"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={(event) => event.stopPropagation()} accessible={false} accessibilityViewIsModal
            className="max-h-full w-full max-w-md overflow-hidden rounded-[22px] border border-border bg-card">
            <View className="flex-row items-center justify-between px-[18px] pt-2.5">
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
  const { triggerRef: repeatRef, anchor: repeatAnchor, open: openRepeat, close: closeRepeat } = useAnchoredMenu();
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
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
    const input: TaskInput = { title: title.trim(), notes: notes.trim(), list_id: task?.list_id ?? null, due_date: dueDate, priority: task?.priority ?? 0, repeat, reminder_time: reminder ? time.trim() : null };
    if (!isTaskInput(input)) { setError(t("tasksInvalid")); return; }
    const reminderDate = taskReminderDate(input);
    if (reminderDate && reminderDate.getTime() <= Date.now()) { setError(t("tasksReminderPast")); return; }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try { await onSave(input, task?.id); }
    catch { if (mountedRef.current) setError(t("errorSavingData")); }
    finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  };

  const labelClass = "mb-[7px] text-[13px] font-semibold text-foreground";
  const inputClass = "min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground";
  return (
    <><TaskFormDialog title={t(task ? "tasksEdit" : "tasksAdd")} busy={busy} onClose={close}>
        <ScrollView className="grow-0" contentContainerClassName="gap-3 p-[18px]" keyboardShouldPersistTaps="handled">
          {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
          <View><Text className={labelClass}>{t("tasksTitle")}</Text>
            <TextInput value={title} onChangeText={setTitle} editable={!busy} maxLength={200} autoFocus={!task}
              placeholder={t("tasksTitlePlaceholder")} placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("tasksTitle")} className={inputClass} />
          </View>
          <View><Text className={labelClass}>{t("tasksDue")}</Text>
            <Button variant="secondary" icon={CalendarDays} label={dueDate ? formatTaskDate(dueDate) : t("tasksAddDate")} disabled={busy} onPress={() => setShowDate(true)} />
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Button variant="secondary" label={t("tasksToday")} disabled={busy} onPress={() => changeDate(taskDateKey())} />
              <Button variant="secondary" label={t("tasksTomorrow")} disabled={busy} onPress={() => { const date = new Date(); date.setDate(date.getDate() + 1); changeDate(taskDateKey(date)); }} />
              {dueDate ? <Button variant="secondary" label={t("clear")} disabled={busy} onPress={() => changeDate(null)} /> : null}
            </View>
          </View>
          <View><Text className={labelClass}>{t("tasksRepeat")}</Text>
            <View ref={repeatRef} collapsable={false}>
              <Pressable disabled={busy || !dueDate} onPress={openRepeat} accessibilityRole="button" accessibilityLabel={t("tasksRepeat")} accessibilityState={{ expanded: repeatAnchor !== null, disabled: busy || !dueDate }} className="min-h-[44px] flex-row items-center justify-between gap-2 rounded-[11px] border border-border/60 bg-card px-3 py-2.5 disabled:opacity-50">
                <Text className="text-sm text-foreground">{t(REPEATS.find(option => option.value === repeat)!.key)}</Text><ChevronDown size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {repeat !== "none" && <Text className="mt-2 text-xs leading-[18px] text-muted-foreground">{t("tasksRepeatHint")}</Text>}
          </View>
          <View className="min-h-[44px] flex-row items-center justify-between gap-3"><Text className="flex-1 text-[13px] font-semibold text-foreground">{t("tasksReminder")}</Text>
            <Switch value={reminder} onValueChange={(enabled) => void toggleReminder(enabled)} disabled={busy || !dueDate} accessibilityLabel={t("tasksReminder")}
              trackColor={{ false: colors.muted, true: colors.primary }} thumbColor={colors.card} />
          </View>
          {!dueDate && <Text className="text-xs leading-[18px] text-muted-foreground">{t("tasksScheduleNeedsDate")}</Text>}
          {reminder && dueDate ? <View><Text className={labelClass}>{t("tasksReminderTime")}</Text>
            <TextInput value={time} onChangeText={setTime} editable={!busy} maxLength={5} autoCapitalize="none" autoCorrect={false}
              placeholder="09:00" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t("tasksReminderTime")} className={inputClass} />
            <Text className="mt-2 text-xs leading-[18px] text-muted-foreground">{t("tasksReminderHint", { date: formatTaskDate(dueDate) })}</Text>
          </View> : null}
          <View><Text className={labelClass}>{t("tasksNotes")}</Text>
            <TextInput value={notes} onChangeText={setNotes} editable={!busy} multiline maxLength={10000}
              textAlignVertical="top" accessibilityLabel={t("tasksNotes")} className={cn(inputClass, "min-h-[80px]")} />
          </View>
          <View className="flex-row flex-wrap items-center justify-end gap-2">
            {task && onDelete && <Pressable accessibilityRole="button" accessibilityLabel={t("tasksDeleteTitle")} disabled={busy} className="mr-auto min-h-[44px] justify-center rounded-[11px] disabled:opacity-50" onPress={onDelete}><Text className="text-xs font-semibold text-destructive">{t("delete")}</Text></Pressable>}
            <Button variant="secondary" label={t("cancel")} disabled={busy} onPress={close} />
            <Button label={t("save")} busy={busy} onPress={() => void save()} /></View>
        </ScrollView>
      <AnchoredMenu anchor={repeatAnchor} onClose={closeRepeat} align="start" size="regular" items={REPEATS.map(option => ({ key: option.value, label: t(option.key), selected: repeat === option.value, onPress: () => setRepeat(option.value) }))} />
      {showDate ? <DatePicker value={dueDate} onChange={changeDate} onClose={() => setShowDate(false)} /> : null}
    </TaskFormDialog>
    <ConfirmDialog visible={discard} destructive title={t("tasksDiscardTitle")} message={t("tasksDiscardBody")}
      confirmLabel={t("discard")} cancelLabel={t("keepEditing")} onConfirm={discardChanges} onClose={() => setDiscard(false)} /></>
  );
}
