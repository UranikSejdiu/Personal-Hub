import { useState, useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, Alert, BackHandler, Pressable, Text, View, type ListRenderItemInfo } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { MoreHorizontal, ChevronDown, type AppIconProps } from "../../src/components/AppIcons";
import { Button, IconButton } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import { loadDhikrs, deleteDhikr, reorderDhikrs, type Dhikr } from "../../src/lib/dhikr";
import { setSelectedDhikrId, clearSelectedDhikrIdIfMissing } from "../../src/lib/dhikrSelection";
import { DhikrModal } from "../../src/components/DhikrModal";
import { useThemeColors } from "../../src/lib/theme";
import { cn } from "../../src/lib/utils";

type ModalState =
  | { visible: false }
  | { visible: true; mode: "add" }
  | { visible: true; mode: "edit" | "actions"; dhikr: Dhikr };

const ROW_TRANSITION = LinearTransition.duration(180);
const LIST_CONTENT_STYLE = { paddingBottom: 112 };

function MoveUpIcon(props: AppIconProps) {
  return <View className="rotate-180"><ChevronDown {...props} /></View>;
}

function applyOrder(items: Dhikr[], order: number[]): Dhikr[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) =>
    (positions.get(a.id) ?? positions.size) - (positions.get(b.id) ?? positions.size)
  );
}

function DhikrListRow({ item, index, count, arranging, saving, t, onMove, onActions, onSelect }: {
  item: Dhikr;
  index: number;
  count: number;
  arranging: boolean;
  saving: boolean;
  t: ReturnType<typeof useI18n>["t"];
  onMove: (id: number, direction: -1 | 1) => void;
  onActions: (dhikr: Dhikr) => void;
  onSelect: (dhikr: Dhikr) => void;
}) {
  const dailyLimit = item.daily_limit;
  const hasGoal = dailyLimit != null && dailyLimit > 0;
  const goalComplete = hasGoal && item.daily_count >= dailyLimit;

  return (
    <Card className="mb-3 px-4 py-3">
      <View className="flex-row items-center gap-3">
        {arranging && (
          <Text className="w-5 text-sm font-medium text-muted-foreground">{index + 1}</Text>
        )}
        <Pressable
          onPress={() => onSelect(item)}
          disabled={arranging || saving}
          className="min-h-[44px] min-w-0 flex-1 justify-center rounded-lg py-1 active:opacity-70"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t("openDhikrNamed", { name: item.name })}
          accessibilityState={{ disabled: arranging || saving }}
        >
          <Text className="text-base font-semibold text-foreground">{item.name}</Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {t("total")}: {item.total_count.toLocaleString()}
          </Text>
        </Pressable>
        {arranging ? (
          <View className="flex-row rounded-xl bg-muted/40">
            <IconButton icon={MoveUpIcon} onPress={() => onMove(item.id, -1)}
              disabled={saving || index === 0}
              accessibilityLabel={t("dhikrMoveUp", { name: item.name })} />
            <IconButton icon={ChevronDown} onPress={() => onMove(item.id, 1)}
              disabled={saving || index === count - 1}
              accessibilityLabel={t("dhikrMoveDown", { name: item.name })} />
          </View>
        ) : (
          <IconButton icon={MoreHorizontal} onPress={() => onActions(item)} disabled={saving}
            accessibilityLabel={t("dhikrActionsFor", { name: item.name })} />
        )}
      </View>
      {hasGoal && (
        <View className="mt-3 gap-2">
          <View className="flex-row flex-wrap items-center justify-between gap-1">
            <Text className="text-xs text-muted-foreground">{t("dhikrToday")}</Text>
            <Text className={cn("text-xs font-semibold", goalComplete ? "text-success" : "text-primary")}>
              {item.daily_count.toLocaleString()} / {dailyLimit.toLocaleString()}
            </Text>
          </View>
          <View className="h-1.5 overflow-hidden rounded-full bg-secondary"
            accessible accessibilityRole="progressbar"
            accessibilityLabel={t("dhikrDailyProgress", { name: item.name })}
            accessibilityValue={{ min: 0, max: dailyLimit, now: Math.min(item.daily_count, dailyLimit) }}>
            <View className={cn("h-full rounded-full", goalComplete ? "bg-success" : "bg-primary")}
              style={{ width: `${Math.max(0, Math.min(100, (item.daily_count / dailyLimit) * 100))}%` }} />
          </View>
        </View>
      )}
    </Card>
  );
}

export default function DhikrListScreen() {
  const { t } = useI18n();
  const haptics = useHaptics();
  const colors = useThemeColors();
  const router = useRouter();
  const [dhikrs, setDhikrs] = useState<Dhikr[]>([]);
  const [modal, setModal] = useState<ModalState>({ visible: false });
  // Draft IDs are separate from the persisted records; cancel never writes.
  const [draftOrder, setDraftOrder] = useState<number[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const draftOrderRef = useRef<number[] | null>(null);
  const operationRef = useRef<"idle" | "arranging" | "saving">("idle");
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const loadSequenceRef = useRef(0);
  const focusedRef = useRef(false);

  const arranging = draftOrder !== null;
  const displayedDhikrs = useMemo(() => draftOrder ? applyOrder(dhikrs, draftOrder) : dhikrs, [dhikrs, draftOrder]);

  const cancelArrange = useCallback(() => {
    if (operationRef.current === "saving") return;
    draftOrderRef.current = null;
    setDraftOrder(null);
    operationRef.current = "idle";
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setIsLoading(true);
    setLoadFailed(false);
    try {
      await pendingSaveRef.current;
      const data = await loadDhikrs();
      if (!focusedRef.current || sequence !== loadSequenceRef.current || operationRef.current !== "idle") return;
      setDhikrs(data);
    } catch {
      if (focusedRef.current && sequence === loadSequenceRef.current) {
        setLoadFailed(true);
        toast.error(t("errorLoadingData"));
      }
    } finally {
      if (focusedRef.current && sequence === loadSequenceRef.current) setIsLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void refresh();
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (operationRef.current === "saving") return true;
      if (operationRef.current !== "arranging") return false;
      cancelArrange();
      return true;
    });
    return () => {
      focusedRef.current = false;
      ++loadSequenceRef.current;
      back.remove();
      // Leaving the list discards only the preview. A started save still finishes.
      draftOrderRef.current = null;
      setDraftOrder(null);
      if (operationRef.current !== "saving") operationRef.current = "idle";
    };
  }, [cancelArrange, refresh]));

  const beginArrange = useCallback(() => {
    if (operationRef.current !== "idle" || isLoading || loadFailed || dhikrs.length < 2) return;
    ++loadSequenceRef.current;
    const order = dhikrs.map((item) => item.id);
    draftOrderRef.current = order;
    setDraftOrder(order);
    operationRef.current = "arranging";
    void haptics.light();
  }, [dhikrs, haptics, isLoading, loadFailed]);

  const moveDhikr = useCallback((id: number, direction: -1 | 1) => {
    if (operationRef.current !== "arranging" || !draftOrderRef.current) return;
    const order = [...draftOrderRef.current];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    // Update the ref with the preview so rapid taps use the latest order.
    draftOrderRef.current = order;
    setDraftOrder(order);
    void haptics.light();
  }, [haptics]);

  const finishArrange = useCallback(async () => {
    if (operationRef.current !== "arranging" || !draftOrderRef.current) return;
    const order = [...draftOrderRef.current];
    if (order.every((id, index) => id === dhikrs[index]?.id)) {
      cancelArrange();
      return;
    }
    operationRef.current = "saving";
    setIsSaving(true);
    const save = (async () => {
      try {
        await reorderDhikrs(order);
        setDhikrs((current) => applyOrder(current, order));
        draftOrderRef.current = null;
        setDraftOrder(null);
      } catch {
        // Keep the visible draft for retry while the list remains focused.
        toast.error(t("errorReordering"));
      } finally {
        operationRef.current = draftOrderRef.current ? "arranging" : "idle";
        setIsSaving(false);
      }
    })();
    pendingSaveRef.current = save;
    await save;
    if (pendingSaveRef.current === save) pendingSaveRef.current = null;
  }, [cancelArrange, dhikrs, t]);

  const handleSelect = useCallback(async (dhikr: Dhikr) => {
    if (operationRef.current !== "idle") return;
    try {
      await setSelectedDhikrId(dhikr.id);
    } catch {
      toast.error(t("errorSavingData"));
      return;
    }
    if (operationRef.current !== "idle" || !focusedRef.current) return;
    void haptics.light();
    router.push("/(dhikr)");
  }, [haptics, router, t]);

  const handleAdd = useCallback(() => {
    if (operationRef.current !== "idle") return;
    setModal({ visible: true, mode: "add" });
  }, []);

  const handleEdit = useCallback((dhikr: Dhikr) => {
    setModal({ visible: true, mode: "edit", dhikr });
  }, []);

  const handleDelete = useCallback((dhikr: Dhikr) => {
    Alert.alert(t("deleteConfirmTitle"), t("deleteConfirmBody", { name: dhikr.name }), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"), style: "destructive", onPress: async () => {
          try {
            await deleteDhikr(dhikr.id);
            ++loadSequenceRef.current;
            setModal({ visible: false });
            const remaining = dhikrs.filter((item) => item.id !== dhikr.id);
            setDhikrs(remaining);
            void clearSelectedDhikrIdIfMissing(remaining.map((item) => item.id)).catch(() => {
              toast.error(t("errorSavingData"));
            });
          } catch {
            toast.error(t("errorDeletingDhikr"));
          }
        },
      },
    ]);
  }, [dhikrs, t]);

  const handleActions = useCallback((dhikr: Dhikr) => {
    if (operationRef.current !== "idle") return;
    void haptics.light();
    setModal({ visible: true, mode: "actions", dhikr });
  }, [haptics]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<Dhikr>) => (
    <DhikrListRow item={item} index={index} count={displayedDhikrs.length} arranging={arranging} saving={isSaving}
      t={t} onMove={moveDhikr} onActions={handleActions} onSelect={handleSelect} />
  ), [arranging, displayedDhikrs.length, handleActions, handleSelect, isSaving, moveDhikr, t]);

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="w-full max-w-md flex-1 self-center px-4 pt-4">
          <View className="mb-3 gap-1">
            <View className="min-h-[44px] flex-row flex-wrap items-center justify-between gap-2">
              <Text className="text-xl font-bold text-foreground">{t(arranging ? "dhikrArrangeTitle" : "myDhikrs")}</Text>
              {arranging ? (
                <View className="flex-row items-center gap-1">
                  <Pressable onPress={cancelArrange} disabled={isSaving}
                    className="min-h-[44px] items-center justify-center rounded-lg px-3 active:bg-muted"
                    accessible accessibilityRole="button" accessibilityLabel={t("cancel")}
                    accessibilityState={{ disabled: isSaving }}>
                    <Text className="text-sm font-medium text-muted-foreground">{t("cancel")}</Text>
                  </Pressable>
                  <Button label={t(isSaving ? "saving" : "dhikrArrangeDone")} onPress={finishArrange} busy={isSaving} className="px-4 py-2" />
                </View>
              ) : (
                <View className="flex-row items-center gap-1">
                  {dhikrs.length > 1 && (
                    <Pressable onPress={beginArrange} disabled={isSaving || isLoading || loadFailed}
                      className="min-h-[44px] items-center justify-center rounded-lg px-2 active:bg-muted"
                      accessible accessibilityRole="button" accessibilityLabel={t("dhikrArrange")}
                      accessibilityState={{ disabled: isSaving || isLoading || loadFailed }}>
                      <Text className="text-sm font-semibold text-primary">{t("dhikrArrange")}</Text>
                    </Pressable>
                  )}
                  <Button label={t("addDhikrBtn")} onPress={handleAdd} disabled={isSaving || isLoading} className="px-3 py-2" />
                </View>
              )}
            </View>
            <View className="py-1">
              <Text className="text-sm text-muted-foreground">{t(arranging ? "dhikrArrangeHint" : "dhikrListTouchHint")}</Text>
            </View>
          </View>
          <Animated.FlatList
            data={displayedDhikrs}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            itemLayoutAnimation={ROW_TRANSITION}
            skipEnteringExitingAnimations
            className="flex-1"
            contentContainerStyle={LIST_CONTENT_STYLE}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={isLoading ? (
              <View className="items-center py-12"><ActivityIndicator color={colors.primary} accessibilityLabel={t("loading")} /></View>
            ) : loadFailed ? (
              <Card className="items-center gap-3 py-8">
                <Text className="text-sm text-muted-foreground">{t("errorLoadingData")}</Text>
                <Button label={t("retry")} onPress={refresh} variant="secondary" />
              </Card>
            ) : (
              <Card className="items-center gap-3 py-8">
                <Text className="text-base font-semibold text-foreground">{t("noDhikrsAdded")}</Text>
                <Text className="text-center text-sm text-muted-foreground">{t("addFirstDhikr")}</Text>
              </Card>
            )}
          />
        </View>
      </View>
      {modal.visible && (
        <DhikrModal haptics={haptics}
          {...(modal.mode === "add" ? { mode: modal.mode }
            : modal.mode === "edit" ? { mode: modal.mode, dhikr: modal.dhikr }
              : { mode: modal.mode, dhikr: modal.dhikr, onEdit: () => handleEdit(modal.dhikr), onDelete: () => handleDelete(modal.dhikr) })}
          onClose={() => setModal({ visible: false })}
          onSave={(dhikr) => {
            ++loadSequenceRef.current;
            setDhikrs((current) => modal.mode === "add" ? [...current, dhikr]
              : current.map((item) => item.id === dhikr.id ? dhikr : item));
            setModal({ visible: false });
          }}
        />
      )}
    </>
  );
}
