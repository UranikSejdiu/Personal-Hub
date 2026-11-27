import { Text } from "../../src/components/ui/Typography";
import { useState, useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, AppState, View, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { DhikrCounterTitle } from "../../src/components/DhikrCounterTitle";
import { Check, ChevronLeft, ChevronRight, Sparkles, Star, RotateCcw } from "../../src/components/AppIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { toast } from "sonner-native";
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
  const haptics = useHaptics();
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
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

  const [countError, setCountError] = useState("");

  const clearFeedback = useCallback(() => {
    setCountError("");
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
      if (!focusedRef.current || sequence !== loadSequenceRef.current) return;
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
        toast.error("Failed to load data.");
      }
    } finally {
      if (focusedRef.current && sequence === loadSequenceRef.current) {
        interactiveRef.current = loaded;
        setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void refresh();
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const scheduleMidnight = () => {
      clearTimeout(midnight);
      if (AppState.currentState != null && AppState.currentState !== "active") return;
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnight = setTimeout(() => { void refresh(); scheduleMidnight(); }, nextDay.getTime() - now.getTime());
    };
    scheduleMidnight();
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") {
        scheduleMidnight();
        void refresh();
      } else {
        clearTimeout(midnight);
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
      clearTimeout(midnight);
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
    // A tap can arrive before the midnight refresh or a resumed read completes.
    const dhikr = stored.last_reset_date < day ? { ...stored, daily_count: 0, last_reset_date: day } : stored;
    if (dhikr.total_count >= Number.MAX_SAFE_INTEGER || dhikr.daily_count >= Number.MAX_SAFE_INTEGER) {
      setCountError("Maximum count reached. Edit or reset this counter to continue.");
      toast.error("Maximum count reached. Edit or reset this counter to continue.");
      return;
    }
    const limit = dhikr.daily_limit;
    if (limit != null && limit > 0 && dhikr.daily_count >= limit) {
      showWarning();
      return;
    }
    setCountError("");
    const willHitLimit = limit != null && limit > 0 && dhikr.daily_count + 1 >= limit;
    updateRecord(dhikr.id, () => ({
      ...dhikr, daily_count: dhikr.daily_count + 1, total_count: dhikr.total_count + 1,
    }));
    if (willHitLimit) {
      void haptics.success();
      toast.success("Daily Goal Complete!");
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
          setCountError("Tap could not be saved. Tap the counter to try again.");
          toast.error("Failed to save data.");
        }
      }
    });
  }, [haptics, showWarning, stopFireworks, updateRecord]);

  const handleReset = useCallback(async () => {
    const row = resetTarget && recordsRef.current.get(resetTarget.id);
    if (!row || !interactiveRef.current || resettingRef.current) return;
    resettingRef.current = true;
    setResetting(true);
    try {
      await queueDhikrWrite(async () => {
        await resetDhikr(row.id);
        updateRecord(row.id, current => ({
          ...current, daily_count: 0, total_count: 0, last_reset_date: todayDate(),
        }));
      });
      clearFeedback();
      setResetTarget(null);
    } catch {
      if (focusedRef.current) { setCountError("Failed to reset dhikr."); toast.error("Failed to reset dhikr."); }
    } finally {
      resettingRef.current = false;
      setResetting(false);
    }
  }, [clearFeedback, resetTarget, updateRecord]);

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
      <ActivityIndicator color={colors.primary} accessibilityLabel="Loading…" />
    </View>;
  }
  if (loadFailed) {
    return <View className="flex-1 items-center justify-center gap-3 bg-background px-4">
      <Text className="text-base text-muted-foreground">Failed to load data.</Text>
      <Pressable onPress={() => { void refresh(); }} accessibilityRole="button" accessibilityLabel="Retry"
        className="min-h-[44px] justify-center rounded-full bg-primary px-4 py-2.5">
        <Text className="text-sm font-semibold text-primary-foreground">Retry</Text>
      </Pressable>
    </View>;
  }


  if (dhikrs.length === 0 || !activeDhikr) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-5">
        <View className="w-full max-w-md items-center rounded-[28px] border border-border bg-surface-container px-5 py-10">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-background">
            <Star size={26} color={colors.foreground} />
          </View>
          <Text className="mt-4 text-title-large font-semibold text-foreground">
            No dhikr yet
          </Text>
          <Pressable
            onPress={handleOpenList}
            className="mt-5 min-h-[48px] flex-row items-center gap-2 rounded-full bg-primary px-4 py-2.5 active:opacity-70"
            accessible
            accessibilityRole="button"
            accessibilityLabel="Add Dhikr"
            android_ripple={{ color: withAlpha(colors.primaryForeground, 0.12) }}
          >
            <Sparkles size={18} color={colors.primaryForeground} />
            <Text className="text-label-large font-medium text-primary-foreground">
              Add Dhikr
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const formattedTotal = activeDhikr.total_count.toLocaleString("en");
  const canCycle = dhikrs.length > 1;
  const dailyLimit = activeDhikr.daily_limit;
  const todayCount = activeDhikr.last_reset_date < todayDate() ? 0 : activeDhikr.daily_count;
  const limitReached = dailyLimit != null && dailyLimit > 0 && todayCount >= dailyLimit;

  return (
    <View className="relative flex-1 bg-background">
      {showFireworks && (
        <Fireworks color={colors.foreground} onComplete={stopFireworks} />
      )}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-md grow items-center gap-4 self-center px-5 pt-4">
          <View className="w-full flex-row items-start gap-2">
            {canCycle && <Pressable
              onPress={handlePrev}
              disabled={isLoading || resetting}
              className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Previous"
              accessibilityState={{ disabled: isLoading || resetting }}
            >
              <ChevronLeft size={20} color={colors.mutedForeground} />
            </Pressable>}
            <Pressable onPress={handleOpenList} disabled={resetting}
              className="min-h-[48px] min-w-0 flex-1 items-center justify-center gap-0.5 py-1 active:opacity-70"
              accessibilityRole="button" accessibilityLabel={`Choose a dhikr: ${activeDhikr.name}`}
              accessibilityState={{ disabled: resetting }}>
              <DhikrCounterTitle name={activeDhikr.name} />
              {canCycle && <Text className="text-label-medium text-muted-foreground">{`${activeIndex + 1} of ${dhikrs.length}`}</Text>}
            </Pressable>
            {canCycle && <Pressable
              onPress={handleNext}
              disabled={isLoading || resetting}
              className="h-12 w-12 items-center justify-center rounded-full active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Next"
              accessibilityState={{ disabled: isLoading || resetting }}
            >
              <ChevronRight size={20} color={colors.mutedForeground} />
            </Pressable>}
          </View>

          <Pressable
            onPress={handleTap}
            disabled={isLoading || resetting}
            accessibilityState={{ disabled: isLoading || resetting }}
            unstable_pressDelay={0}
            android_disableSound={true}
            className="min-h-[224px] w-full flex-1 items-center justify-center rounded-[32px] border border-border bg-surface-container px-4 py-5 active:bg-surface-container-high"
            accessible
            accessibilityRole="button"
            accessibilityLabel="Tap to count"
            accessibilityValue={{ text: `Total recitations: ${formattedTotal}` }}
          >
            <Text
              testID="dhikr-total-count"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.18}
              className="w-full text-center font-medium text-foreground"
              style={{ fontSize: Math.min(132, width * 0.34), fontVariant: ["tabular-nums"], letterSpacing: -1 }}
            >
              {formattedTotal}
            </Text>
          </Pressable>
          <View className="w-full items-center gap-2 px-1">
            {countError && <Text accessibilityRole="alert" className="text-sm text-destructive">{countError}</Text>}
            {(showLimitWarning || limitReached) && (
              <View className="flex-row items-center gap-1.5">
                {limitReached && !showLimitWarning && <Check size={15} color={colors.success} />}
                <Text accessibilityLiveRegion="polite" className={`shrink text-body-medium font-medium ${showLimitWarning ? "text-destructive" : "text-success"}`}>
                  {showLimitWarning ? "Daily limit reached" : "Daily goal complete"}
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => {
                if (interactiveRef.current && !resettingRef.current) setResetTarget({ id: activeDhikr.id, name: activeDhikr.name });
              }}
              disabled={isLoading || resetting}
              accessibilityState={{ disabled: isLoading || resetting, busy: resetting }}
              className="min-h-[48px] flex-row items-center gap-2 rounded-full px-4 py-2.5 active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Reset"
            >
              <RotateCcw size={18} color={colors.mutedForeground} />
              <Text className="text-label-large font-medium text-muted-foreground">Reset counts</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <ConfirmDialog visible={resetTarget !== null} title="Reset counts?"
        message={`Reset today’s count and the total count for "${resetTarget?.name ?? ""}" to zero? This cannot be undone.`}
        error={countError} confirmLabel="Reset" destructive
        onClose={() => { if (!resettingRef.current) setResetTarget(null); }} onConfirm={handleReset} />

    </View>
  );
}
