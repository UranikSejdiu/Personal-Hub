import { Text } from "./ui/Typography";
import { AppAlerts } from "./AppAlerts";
import { useMemo, useState } from "react";
import { Modal, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "./AppIcons";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import { taskDateKey } from "../lib/taskDates";
import { cn } from "../lib/utils";

export interface DatePickerProps {
  mode?: "date" | "month";
  minimumDate?: string;
  initialDisplay?: "selected" | "current";
  value: string | null;
  onChange: (value: string | null) => void;
  onClose: () => void;
}

function parseValue(v: string | null): Date | null {
  if (!v) return null;
  const [y, m, d = 1] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function DatePicker({ minimumDate, value, onChange, onClose, mode = "date", initialDisplay = "selected" }: DatePickerProps) {
  const colors = useThemeColors();
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [page, setDisplay] = useState(() => initialDisplay === "current" ? today : parseValue(value) ?? today);
  const display = useMemo(() => minimumDate && taskDateKey(page).slice(0, 7) < minimumDate.slice(0, 7)
    ? parseValue(minimumDate)! : page, [page, minimumDate]);
  const atMinimum = mode === "date" && !!minimumDate && taskDateKey(display).slice(0, 7) === minimumDate.slice(0, 7);

  const locale = "en-US";

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, i).toLocaleDateString(locale, { weekday: "narrow" })
    );
  }, [locale]);

  const days = useMemo(() => {
    const first = new Date(display.getFullYear(), display.getMonth(), 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(
      display.getFullYear(),
      display.getMonth() + 1,
      0
    ).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [display]);

  const monthLabel = display.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  const selectDay = (d: number) => {
    const y = display.getFullYear();
    const m = display.getMonth();
    const key = taskDateKey(new Date(y, m, d));
    if (minimumDate && key < minimumDate) return;
    onChange(key);
    onClose();
  };

  const isToday = (d: number | null) => {
    if (d == null) return false;
    return (
      display.getFullYear() === today.getFullYear() &&
      display.getMonth() === today.getMonth() &&
      d === today.getDate()
    );
  };

  const isSelected = (d: number | null) => {
    if (d == null) return false;
    const v = parseValue(value);
    return (
      v !== null &&
      display.getFullYear() === v.getFullYear() &&
      display.getMonth() === v.getMonth() &&
      d === v.getDate()
    );
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/50 p-4"
        style={[variables, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        accessible={false}
      >
        <Pressable
          onPress={event => event.stopPropagation()}
          className="w-full max-w-sm rounded-[28px] bg-surface-container-high p-[18px] shadow-xl"
          accessible={false}
          accessibilityViewIsModal
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() =>
                setDisplay(
                  new Date(
                    display.getFullYear() - (mode === "month" ? 1 : 0),
                    mode === "month" ? display.getMonth() : display.getMonth() - 1,
                    1
                  )
                )
              }
              className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg active:bg-muted"
              accessible
              accessibilityRole="button"
              disabled={atMinimum}
              style={{ opacity: atMinimum ? 0.35 : 1 }}
              accessibilityState={{ disabled: atMinimum }}
              accessibilityLabel={mode === "month" ? "Previous year" : "Previous month"}
            >
              <ChevronLeft size={20} color={colors.mutedForeground} />
            </Pressable>
            <Text className="text-base font-semibold text-foreground">
              {mode === "month" ? display.getFullYear() : monthLabel}
            </Text>
            <Pressable
              onPress={() =>
                setDisplay(
                  new Date(
                    display.getFullYear() + (mode === "month" ? 1 : 0),
                    mode === "month" ? display.getMonth() : display.getMonth() + 1,
                    1
                  )
                )
              }
              className="min-h-[44px] min-w-[44px] items-center justify-center rounded-lg active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={mode === "month" ? "Next year" : "Next month"}
            >
              <ChevronRight size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {mode === "month" ? (
            <View className="mt-3 flex-row flex-wrap">
              {Array.from({ length: 12 }, (_, month) => {
                const label = new Date(display.getFullYear(), month, 1).toLocaleDateString(locale, { month: "short" });
                const selectedDate = parseValue(value);
                const selected = selectedDate?.getFullYear() === display.getFullYear() && selectedDate.getMonth() === month;
                return (
                  <Pressable
                    key={month}
                    onPress={() => { onChange(`${display.getFullYear()}-${String(month + 1).padStart(2, "0")}`); onClose(); }}
                    className={cn("min-h-[44px] w-1/3 items-center justify-center rounded-lg px-2 py-2.5 active:opacity-70", selected && "bg-primary")}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${label} ${display.getFullYear()}`}
                    accessibilityState={{ selected }}
                  >
                    <Text className={cn("text-sm font-medium", selected ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : <>
          <View className="flex-row py-2">
            {weekdays.map((d, i) => (
              <Text key={i} className="flex-1 text-center text-xs uppercase text-muted-foreground">
                {d}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {days.map((d, i) => {
              const blank = d == null;
              const past = !blank && !!minimumDate && taskDateKey(new Date(display.getFullYear(), display.getMonth(), d)) < minimumDate;
              const selected = !blank && !past && isSelected(d);
              const todayFlag = !blank && isToday(d);
              return (
                <Pressable
                  key={i}
                  onPress={blank ? undefined : () => selectDay(d as number)}
                  disabled={blank || past}
                  className="min-h-[44px] w-[14.28%] items-center justify-center rounded-lg active:bg-muted"
                  accessible={!blank}
                  accessibilityRole="button"
                  accessibilityLabel={blank ? undefined : new Date(display.getFullYear(), display.getMonth(), d).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  accessibilityState={{ selected, disabled: blank || past }}
                  style={{ opacity: blank ? 0 : past ? 0.4 : 1 }}
                >
                  {!blank && (
                    <View
                      className={cn(
                        "h-8 w-8 items-center justify-center rounded-full",
                        selected && "bg-primary",
                        !selected && todayFlag && "border border-primary/50",
                      )}
                    >
                      <Text
                        className={cn(
                          "text-sm font-medium",
                          selected && "text-primary-foreground",
                          !selected && todayFlag && "text-primary",
                          !selected && !todayFlag && "text-foreground",
                        )}
                      >
                        {d}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          </>}
          <View className="mt-4 flex-row justify-end">
            <Pressable
              onPress={() => {
                onChange(null);
                onClose();
              }}
              className="min-h-[44px] items-center justify-center rounded-lg bg-secondary px-3 py-2 active:opacity-70"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Clear"
            >
              <Text className="text-sm font-medium text-muted-foreground">
                Clear
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <AppAlerts />
    </Modal>
  );
}
