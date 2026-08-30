import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { ChevronLeft, ChevronRight, Sparkles, Star, RotateCcw } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import { useThemeColors } from "../../src/lib/theme";
import {
  loadDhikrs,
  incrementDhikr,
  resetDhikr,
  type Dhikr,
} from "../../src/lib/dhikr";
import {
  getSelectedDhikrId,
  setSelectedDhikrId,
} from "../../src/lib/dhikrSelection";
import Fireworks from "../../src/components/Fireworks";

export default function CounterScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const haptics = useHaptics();
  const colors = useThemeColors();
  const [dhikrs, setDhikrs] = useState<Dhikr[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [showLimitWarning, setShowLimitWarning] = useState(false);

  const fireworksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fireworksTimerRef.current) clearTimeout(fireworksTimerRef.current);
      if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    const rows = await loadDhikrs();
    setDhikrs(rows);
    const savedId = await getSelectedDhikrId();
    if (rows.length > 0) {
      const valid = savedId != null && rows.some((d) => d.id === savedId);
      setSelectedId(valid ? savedId! : rows[0].id);
    } else {
      setSelectedId(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const activeDhikr = dhikrs.find((d) => d.id === selectedId) ?? dhikrs[0] ?? null;

  const selectDhikr = useCallback((id: number) => {
    setSelectedId(id);
    void setSelectedDhikrId(id);
  }, []);

  const handleTap = useCallback(async () => {
    const dhikr = activeDhikr;
    if (!dhikr || animating) return;
    setAnimating(true);
    haptics.light();
    try {
      const updated = await incrementDhikr(dhikr.id);
      if (!updated) {
        haptics.warning();
        setShowLimitWarning(true);
        if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
        limitTimerRef.current = setTimeout(() => setShowLimitWarning(false), 2000);
        return;
      }
      const hitLimit =
        updated.daily_limit != null &&
        updated.daily_limit > 0 &&
        updated.daily_count >= updated.daily_limit;
      setDhikrs((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
      if (hitLimit) {
        haptics.success();
        toast.success(t("goalComplete"));
        setShowFireworks(true);
        if (fireworksTimerRef.current) clearTimeout(fireworksTimerRef.current);
        fireworksTimerRef.current = setTimeout(() => setShowFireworks(false), 2000);
      }
    } catch {
      toast.error(t("errorLoadingData"));
    } finally {
      setAnimating(false);
    }
  }, [activeDhikr, animating, haptics, t]);

  const handleReset = useCallback(async () => {
    if (!activeDhikr) return;
    haptics.warning();
    try {
      await resetDhikr(activeDhikr.id);
      await refresh();
    } catch {
      toast.error(t("errorResettingDhikr"));
    }
  }, [activeDhikr, haptics, refresh, t]);

  const cycle = useCallback(
    (dir: 1 | -1) => {
      if (dhikrs.length === 0) return;
      const idx = dhikrs.findIndex((d) => d.id === selectedId);
      const base = idx < 0 ? 0 : idx;
      const next = (base + dir + dhikrs.length) % dhikrs.length;
      selectDhikr(dhikrs[next].id);
    },
    [dhikrs, selectedId, selectDhikr]
  );

  const handlePrev = useCallback(() => cycle(-1), [cycle]);
  const handleNext = useCallback(() => cycle(1), [cycle]);

  const handleOpenList = useCallback(() => {
    void haptics.light();
    router.push("/(dhikr)/list");
  }, [haptics, router]);

  if (dhikrs.length === 0) {
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
          className="mt-4 flex-row items-center gap-2 rounded-lg bg-primary px-4 py-2.5"
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
        <Fireworks onComplete={() => setShowFireworks(false)} />
      )}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-1 items-center px-4">
          {/* Top selector: name + prev/next chevrons */}
          <View className="flex-row items-center gap-4 w-full justify-center pt-10">
            <Pressable
              onPress={handlePrev}
              className="p-2"
              accessibilityLabel={t("previousDhikr")}
            >
              <ChevronLeft size={28} color={colors.foreground} />
            </Pressable>
            <Text
              className="flex-1 text-center text-xl font-semibold text-foreground"
              numberOfLines={1}
            >
              {activeDhikr.name}
            </Text>
            <Pressable
              onPress={handleNext}
              className="p-2"
              accessibilityLabel={t("nextDhikr")}
            >
              <ChevronRight size={28} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Main counter — vertically centered, larger */}
          <View className="flex-1 items-center justify-center">
            <Pressable
              onPress={handleTap}
              className="items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t("tapToCount")}
            >
              <Text
                className={`text-center font-extralight leading-none ${
                  limitReached ? "text-success" : "text-foreground"
                } ${animating ? "opacity-70" : "opacity-100"}`}
                style={{ fontSize: 132, letterSpacing: -2 }}
              >
                {activeDhikr.total_count.toLocaleString()}
              </Text>
            </Pressable>
          </View>

          {/* Bottom: goal badge + reset */}
          <View className="items-center gap-3 pb-28">
            {limitReached && (
              <View className="rounded-full bg-success/15 px-4 py-2">
                <Text className="text-center text-sm font-medium text-success">
                  {t("goalComplete")}
                </Text>
              </View>
            )}
            <Pressable
              onPress={handleReset}
              className="flex-row items-center gap-2 rounded-full bg-secondary px-5 py-3"
              accessibilityLabel={t("resetLabel")}
            >
              <RotateCcw size={16} color={colors.mutedForeground} />
              <Text className="text-sm text-muted-foreground">{t("resetLabel")}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Limit reached warning banner */}
      {showLimitWarning && (
        <View className="absolute inset-x-0 bottom-32 z-40 items-center px-4">
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
