import { Text } from "../../src/components/ui/Typography";
import { useState, useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, AppState, View, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DhikrCounterTitle } from "../../src/components/DhikrCounterTitle";
import { ChevronLeft, ChevronRight, Sparkles, Star, RotateCcw } from "../../src/components/AppIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import { useThemeColors } from "../../src/lib/theme";
import { withAlpha } from "../../src/lib/utils";
import {
  loadDhikrs, incrementDhikr, resetDhikr, queueDhikrWrite, flushDhikrWrites, todayDate, type Dhikr,
} from "../../src/lib/dhikr";
import { getSelectedDhikrId, setSelectedDhikrId } from "../../src/lib/dhikrSelection";
import Fireworks from "../../src/components/Fireworks";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";

export default function CounterScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const haptics = useHaptics();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { fontScale, width } = useWindowDimensions();
  const counterBottomPadding = Math.max(16, insets.bottom + 8) + Math.ceil(80 * Math.max(1, fontScale)) + 24;
  // The ordered catalog changes only on reload. Taps update a single record,
  // rather than copying and searching the entire catalog on every press.
  const [dhikrs, setDhikrs] = useState<Dhikr[]>([]);
  const [activeDhikr, setActiveDhikr] = useState<Dhikr | null>(null);
  const activeDhikrRef = useRef<Dhikr | null>(null);
  const recordsRef = useRef(new Map<number, Dhikr>());
  const focusedRef = useRef(false);
  const interactiveRef = useRef(false);
  const loadSequenceRef = useRef(0);
  const resettingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: number; name: string } | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFireworks = useCallback(() => setShowFireworks(false), []);
  const activeIndex = useMemo(() => dhikrs.findIndex(row => row.id === activeDhikr?.id), [dhikrs, activeDhikr?.id]);

  const clearFeedback = useCallback(() => {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    limitTimerRef.current = null;
    setShowFireworks(false);
    setShowLimitWarning(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!focusedRef.current || (AppState.currentState != null && AppState.currentState !== "active")) return;
    const sequence = ++loadSequenceRef.current;
    interactiveRef.current = false;
    setIsLoading(true);
    setLoadFailed(false);
    let loaded = false;
    try {
      await flushDhikrWrites();
      const [rows, savedId] = await Promise.all([loadDhikrs(), getSelectedDhikrId()]);
      if (!focusedRef.current || sequence !== loadSequenceRef.current) return;
      recordsRef.current = new Map(rows.map(row => [row.id, row]));
      const selected = (savedId != null ? recordsRef.current.get(savedId) : null) ?? rows[0] ?? null;
      activeDhikrRef.current = selected;
      setActiveDhikr(selected);
      setDhikrs(rows);
      if ((selected?.id ?? null) !== savedId) void setSelectedDhikrId(selected?.id ?? null);
      loaded = true;
    } catch {
      if (focusedRef.current && sequence === loadSequenceRef.current) {
        setLoadFailed(true);
        toast.error(t("errorLoadingData"));
      }
    } finally {
      if (focusedRef.current && sequence === loadSequenceRef.current) {
        interactiveRef.current = loaded;
        setIsLoading(false);
      }
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void refresh();
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") {
        void refresh();
      } else {
        interactiveRef.current = false;
        ++loadSequenceRef.current;
        clearFeedback();
        void flushDhikrWrites();
      }
    });
    return () => {
      focusedRef.current = false;
      interactiveRef.current = false;
      ++loadSequenceRef.current;
      clearFeedback();
      subscription.remove();
      void flushDhikrWrites();
    };
  }, [clearFeedback, refresh]));

  const updateRecord = useCallback((id: number, change: (row: Dhikr) => Dhikr) => {
    const row = recordsRef.current.get(id);
    if (!row) return;
    const updated = change(row);
    recordsRef.current.set(id, updated);
    if (activeDhikrRef.current?.id === id) {
      activeDhikrRef.current = updated;
      if (focusedRef.current) setActiveDhikr(updated);
    }
  }, []);

  const selectDhikr = useCallback((id: number) => {
    if (!interactiveRef.current || resettingRef.current) return;
    const selected = recordsRef.current.get(id);
    if (!selected) return;
    activeDhikrRef.current = selected;
    setActiveDhikr(selected);
    clearFeedback();
    void setSelectedDhikrId(id);
  }, [clearFeedback]);

  const showWarning = useCallback(() => {
    if (!focusedRef.current || !interactiveRef.current || limitTimerRef.current !== null) return;
    void haptics.warning();
    setShowLimitWarning(true);
    limitTimerRef.current = setTimeout(() => {
      limitTimerRef.current = null;
      setShowLimitWarning(false);
    }, 2000);
  }, [haptics]);

  const handleTap = useCallback(() => {
    if (!interactiveRef.current || resettingRef.current) return;
    const stored = activeDhikrRef.current;
    if (!stored) return;
    const day = todayDate();
    // No midnight polling timer: reset lazily on the first tap or app resume.
    const dhikr = stored.last_reset_date < day ? { ...stored, daily_count: 0, last_reset_date: day } : stored;
    if (dhikr.total_count >= Number.MAX_SAFE_INTEGER || dhikr.daily_count >= Number.MAX_SAFE_INTEGER) {
      toast.error(t("countMaximumReached"));
      return;
    }
    const limit = dhikr.daily_limit;
    if (limit != null && limit > 0 && dhikr.daily_count >= limit) {
      showWarning();
      return;
    }
    const willHitLimit = limit != null && limit > 0 && dhikr.daily_count + 1 >= limit;
    updateRecord(dhikr.id, () => ({
      ...dhikr, daily_count: dhikr.daily_count + 1, total_count: dhikr.total_count + 1,
    }));
    if (willHitLimit) {
      void haptics.success();
      toast.success(t("goalComplete"));
      setShowFireworks(true);
    } else {
      void haptics.light();
    }

    // Persist each accepted tap immediately in order; no delayed disk flush or
    // weaker SQLite durability. Roll back only that tap if persistence fails.
    void queueDhikrWrite(async () => {
      const rollback = () => updateRecord(dhikr.id, row => ({
        ...row,
        daily_count: row.last_reset_date === day ? Math.max(0, row.daily_count - 1) : row.daily_count,
        total_count: Math.max(0, row.total_count - 1),
      }));
      try {
        if (!(await incrementDhikr(dhikr.id, day))) {
          rollback();
          if (focusedRef.current) {
            stopFireworks();
            showWarning();
          }
        }
      } catch {
        rollback();
        if (focusedRef.current) {
          stopFireworks();
          toast.error(t("errorSavingData"));
        }
      }
    });
  }, [haptics, showWarning, stopFireworks, t, updateRecord]);

  const handleReset = useCallback(async () => {
    const row = resetTarget && recordsRef.current.get(resetTarget.id);
    if (!row || !interactiveRef.current || resettingRef.current) return;
    resettingRef.current = true;
    setResetting(true);
    clearFeedback();
    try {
      await queueDhikrWrite(async () => {
        await resetDhikr(row.id);
        updateRecord(row.id, current => ({
          ...current, daily_count: 0, total_count: 0, last_reset_date: todayDate(),
        }));
      });
      setResetTarget(null);
    } catch {
      if (focusedRef.current) toast.error(t("errorResettingDhikr"));
    } finally {
      resettingRef.current = false;
      setResetting(false);
    }
  }, [clearFeedback, resetTarget, t, updateRecord]);

  const cycle = useCallback((dir: 1 | -1) => {
    if (dhikrs.length === 0) return;
    const index = dhikrs.findIndex(row => row.id === activeDhikrRef.current?.id);
    const next = ((index < 0 ? 0 : index) + dir + dhikrs.length) % dhikrs.length;
    selectDhikr(dhikrs[next].id);
  }, [dhikrs, selectDhikr]);
  const handlePrev = useCallback(() => cycle(-1), [cycle]);
  const handleNext = useCallback(() => cycle(1), [cycle]);
  const handleOpenList = useCallback(() => {
    void haptics.light();
    router.push("/(dhikr)/list");
  }, [haptics, router]);

  if (isLoading && !activeDhikr) {
    return <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={colors.primary} accessibilityLabel={t("loading")} />
    </View>;
  }
  if (loadFailed) {
    return <View className="flex-1 items-center justify-center gap-3 bg-background px-4">
      <Text className="text-base text-muted-foreground">{t("errorLoadingData")}</Text>
      <Pressable onPress={() => { void refresh(); }} accessibilityRole="button" accessibilityLabel={t("retry")}
        className="min-h-[44px] justify-center rounded-xl bg-primary px-4 py-2.5">
        <Text className="text-sm font-semibold text-primary-foreground">{t("retry")}</Text>
      </Pressable>
    </View>;
  }


  if (dhikrs.length === 0 || !activeDhikr) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Star size={48} color={colors.mutedForeground} />
        <Text className="mt-4 text-lg font-semibold text-foreground">
          {t("noDhikrYet")}
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          {t("addFirstDhikr")}
        </Text>
        <Pressable
          onPress={handleOpenList}
          className="mt-4 min-h-[44px] flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2.5 active:opacity-70"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t("addDhikrBtn")}
          android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
        >
          <Sparkles size={16} color={colors.primaryForeground} />
          <Text className="text-sm font-medium text-primary-foreground">
            {t("addDhikrBtn")}
          </Text>
        </Pressable>
      </View>
    );
  }

  const limitReached =
    activeDhikr.daily_limit != null &&
    activeDhikr.daily_limit > 0 &&
    activeDhikr.daily_count >= activeDhikr.daily_limit;

  return (
    <View className="relative flex-1 bg-background">
      {showFireworks && (
        <Fireworks onComplete={stopFireworks} />
      )}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: counterBottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-md flex-1 items-center self-center px-4 pt-3">
          <View className="w-full flex-row items-center gap-2 rounded-2xl border border-border/60 bg-card p-1">
            <Pressable
              onPress={handlePrev}
              disabled={isLoading || resetting}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("previousDhikr")}
              accessibilityState={{ disabled: isLoading || resetting }}
            >
              <ChevronLeft size={20} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleOpenList} disabled={resetting}
              className="min-h-[44px] min-w-0 flex-1 items-center justify-center py-1 active:opacity-70"
              accessibilityRole="button" accessibilityLabel={`${t("chooseDhikr")}: ${activeDhikr.name}`}
              accessibilityState={{ disabled: resetting }}>
              <DhikrCounterTitle name={activeDhikr.name} />
              <Text className="mt-0.5 text-xs text-muted-foreground">{t("dhikrPosition", { current: activeIndex + 1, count: dhikrs.length })}</Text>
            </Pressable>
            <Pressable
              onPress={handleNext}
              disabled={isLoading || resetting}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("nextDhikr")}
              accessibilityState={{ disabled: isLoading || resetting }}
            >
              <ChevronRight size={20} color={colors.primary} />
            </Pressable>
          </View>

          <Pressable
            onPress={handleTap}
            disabled={isLoading || resetting}
            accessibilityState={{ disabled: isLoading || resetting }}
            unstable_pressDelay={0}
            android_disableSound={true}
            className="min-h-[240px] w-full flex-1 items-center justify-center py-6 active:opacity-70"
            accessible
            accessibilityRole="button"
            accessibilityLabel={t("tapToCount")}
            accessibilityValue={{ text: `${t("totalCountTitle")}: ${activeDhikr.total_count.toLocaleString()}` }}
          >
            <Text
              testID="dhikr-total-count"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.3}
              className={`w-full text-center font-extralight ${
                limitReached ? "text-success" : "text-foreground"
              }`}
              style={{ fontSize: Math.min(132, width * 0.34), letterSpacing: -2 }}
            >
              {activeDhikr.total_count.toLocaleString()}
            </Text>
          </Pressable>
          <View className="items-center gap-3">
            {limitReached && <Text className="text-center text-sm font-medium text-success">{t("goalComplete")}</Text>}
            <Pressable
              onPress={() => {
                if (interactiveRef.current && !resettingRef.current) setResetTarget({ id: activeDhikr.id, name: activeDhikr.name });
              }}
              disabled={isLoading || resetting}
              accessibilityState={{ disabled: isLoading || resetting, busy: resetting }}
              className="min-h-[44px] flex-row items-center gap-2 rounded-full bg-secondary px-4 py-2.5 active:opacity-70"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("resetLabel")}
            >
              <RotateCcw size={16} color={colors.mutedForeground} />
              <Text className="text-sm font-medium text-muted-foreground">{t("resetCounts")}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <ConfirmDialog visible={resetTarget !== null} title={t("resetCountsTitle")}
        message={t("resetCountsBody", { name: resetTarget?.name ?? "" })}
        confirmLabel={t("resetLabel")} destructive
        onClose={() => { if (!resettingRef.current) setResetTarget(null); }} onConfirm={handleReset} />

      {/* Limit reached warning banner */}
      {showLimitWarning && (
        <View className="absolute inset-x-0 z-40 items-center px-4" style={{ bottom: counterBottomPadding + 8 }}>
          <View
            className="rounded-full border px-5 py-2.5"
            style={{
              backgroundColor: colors.destructive,
              borderColor: colors.destructive,
            }}
          >
            <Text className="text-sm font-medium text-destructive-foreground">
              {t("limitReached")}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
