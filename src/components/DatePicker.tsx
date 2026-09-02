import { useMemo, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { cn } from "../lib/utils";

export interface DatePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  onClose: () => void;
}

function parseValue(v: string | null): Date | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function DatePicker({ value, onChange, onClose }: DatePickerProps) {
  const { t, lang } = useI18n();
  const colors = useThemeColors();
  const today = useMemo(() => new Date(), []);

  const [display, setDisplay] = useState<Date>(parseValue(value) ?? today);

  const locale = lang === "sq" ? "sq-AL" : "en-US";

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
    onChange(
      `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
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
        className="flex-1 items-center justify-center bg-black/60 p-4"
      >
        <Pressable
          onPress={() => {}}
          className="w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-xl"
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() =>
                setDisplay(
                  new Date(
                    display.getFullYear(),
                    display.getMonth() - 1,
                    1
                  )
                )
              }
              className="p-1"
            >
              <ChevronLeft size={20} color={colors.mutedForeground} />
            </Pressable>
            <Text className="text-base font-semibold text-foreground">
              {monthLabel}
            </Text>
            <Pressable
              onPress={() =>
                setDisplay(
                  new Date(
                    display.getFullYear(),
                    display.getMonth() + 1,
                    1
                  )
                )
              }
              className="p-1"
            >
              <ChevronRight size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View className="flex-row py-2">
            {weekdays.map((d) => (
              <Text key={d} className="flex-1 text-center text-xs uppercase text-muted-foreground">
                {d}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {days.map((d, i) => {
              const blank = d == null;
              const selected = !blank && isSelected(d);
              const todayFlag = !blank && isToday(d);
              return (
                <Pressable
                  key={i}
                  onPress={blank ? undefined : () => selectDay(d as number)}
                  disabled={blank}
                  className="h-10 w-[14.28%] items-center justify-center rounded-lg"
                  style={blank ? { opacity: 0 } : undefined}
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

          <View className="mt-4 flex-row justify-end">
            <Pressable
              onPress={() => {
                onChange(null);
                onClose();
              }}
              className="rounded-lg bg-secondary px-3 py-1.5"
              accessibilityLabel={t("clear")}
            >
              <Text className="text-sm font-medium text-muted-foreground">
                {t("clear")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
