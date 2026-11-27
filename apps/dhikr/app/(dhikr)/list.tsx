import { actionErrorOptions } from "../../src/lib/actionErrorOptions";
import { Text } from "../../src/components/ui/Typography";
import { memo, useState, useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, BackHandler, FlatList, Pressable, View, type ListRenderItemInfo } from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import Sortable, { type OrderChangeParams, type SortableGridRenderItemInfo, type SortableGridDragEndParams } from "react-native-sortables";
import { Check, MoreHorizontal, GripVertical, Pencil, Trash2 } from "../../src/components/AppIcons";
import { Button, IconButton } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { AnchoredMenu, useAnchoredMenu } from "../../src/components/ui/AnchoredMenu";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useHaptics } from "../../src/hooks/useHaptics";
import { loadDhikrs, deleteDhikr, reorderDhikrs, flushDhikrWrites, type Dhikr } from "../../src/lib/dhikr";
import { setSelectedDhikrId, clearSelectedDhikrIdIfMissing } from "../../src/lib/dhikrSelection";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { DhikrModal } from "../../src/components/DhikrModal";
import { useThemeColors } from "../../src/lib/theme";

type ModalState =
  | { visible: false }
  | { visible: true; mode: "add" }
  | { visible: true; mode: "edit"; dhikr: Dhikr };

const LIST_CONTENT_STYLE = { paddingBottom: 16 };
const dhikrKey = (item: Dhikr) => String(item.id);

function applyOrder(items: Dhikr[], order: number[]): Dhikr[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) =>
    (positions.get(a.id) ?? positions.size) - (positions.get(b.id) ?? positions.size)
  );
}

const DhikrListRow = memo(function DhikrListRow({ item, index, count, arranging = false, saving, onMove, onEdit, onDelete, onSelect }: {
  item: Dhikr;
  index: number;
  count: number;
  arranging?: boolean;
  saving: boolean;
  onMove: (id: number, direction: -1 | 1) => void;
  onEdit: (dhikr: Dhikr) => void;
  onDelete: (dhikr: Dhikr) => void;
  onSelect: (dhikr: Dhikr) => void;
}) {
  const haptics = useHaptics();
  const colors = useThemeColors();
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const dailyLimit = item.daily_limit;
  const hasGoal = dailyLimit != null && dailyLimit > 0;
  const goalComplete = hasGoal && item.daily_count >= dailyLimit;
  const dailyCount = item.daily_count.toLocaleString("en");
  const total = item.total_count.toLocaleString("en");

  return (
    <View className="my-1 rounded-[16px] bg-surface px-4 py-1">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-5 text-sm font-medium tabular-nums text-muted-foreground">{index + 1}</Text>
        <Pressable
          onPress={() => onSelect(item)}
          disabled={arranging || saving}
          className="min-h-[56px] min-w-0 flex-1 flex-row items-center justify-between gap-2 rounded-lg py-2 active:opacity-70"
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}`}
          accessibilityValue={{ text: `${dailyCount} today${hasGoal ? ` of ${dailyLimit.toLocaleString("en")}` : ""}${goalComplete ? ", goal met" : ""}, ${total} total` }}
          accessibilityState={{ disabled: arranging || saving }}
        >
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-foreground">{item.name}</Text>
            <Text className="text-label-medium text-muted-foreground">{`${total} total`}</Text>
          </View>
          <View className="max-w-[55%] shrink items-end">
            <Text className={`text-right text-base font-semibold tabular-nums ${goalComplete ? "text-success" : "text-foreground"}`}>
              {dailyCount}{hasGoal ? ` / ${dailyLimit.toLocaleString("en")}` : ""}
            </Text>
            <View className="flex-row items-center gap-1">
              {goalComplete && <Check size={12} color={colors.success} />}
              <Text className="shrink text-right text-label-medium text-muted-foreground">Today</Text>
            </View>
          </View>
        </Pressable>
        {arranging ? (
          <Sortable.Handle>
            <View accessible
              className="h-[48px] w-[48px] items-center justify-center rounded-full"
              accessibilityRole="adjustable" accessibilityLabel={`Reorder ${item.name}`}
              accessibilityValue={{ min: 1, max: count, now: index + 1 }}
              accessibilityActions={[
                ...(index > 0 ? [{ name: "decrement", label: "Move up" }] : []),
                ...(index < count - 1 ? [{ name: "increment", label: "Move down" }] : []),
              ]}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === "decrement") onMove(item.id, -1);
                if (nativeEvent.actionName === "increment") onMove(item.id, 1);
              }}>
              <GripVertical size={20} color={colors.mutedForeground} />
            </View>
          </Sortable.Handle>
        ) : (
          <View ref={triggerRef} collapsable={false}>
            <IconButton icon={MoreHorizontal} onPress={() => { void haptics.light(); open(); }} disabled={saving}
              selected={anchor !== null}
              accessibilityLabel={`Actions for ${item.name}`}
              accessibilityState={{ expanded: anchor !== null }} />
          </View>
        )}
      </View>
      <AnchoredMenu anchor={anchor} onClose={close} items={[
        { key: "edit", label: "Edit Dhikr", icon: Pencil,
          onPress: () => { void haptics.light(); onEdit(item); } },
        { key: "delete", label: "Delete", icon: Trash2, destructive: true,
          onPress: () => { void haptics.warning(); onDelete(item); } },
      ]} />
    </View>
  );
});

export default function DhikrListScreen() {
  const haptics = useHaptics();
  const colors = useThemeColors();
  const router = useRouter();
  const [dhikrs, setDhikrs] = useState<Dhikr[]>([]);
  const [modal, setModal] = useState<ModalState>({ visible: false });
  const [dhikrToDelete, setDhikrToDelete] = useState<Dhikr | null>(null);
  // Draft IDs are separate from the persisted records; cancel never writes.
  const [draftOrder, setDraftOrder] = useState<number[] | null>(null);
  const [positions, setPositions] = useState<Record<string, number> | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const sessionRef = useRef<number[] | null>(null);
  const draggingRef = useRef(false);
  const saveOnDropRef = useRef(false);
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
      await flushDhikrWrites();
      const data = await loadDhikrs();
      if (!focusedRef.current || sequence !== loadSequenceRef.current || operationRef.current !== "idle") return;
      setDhikrs(data);
    } catch {
      if (focusedRef.current && sequence === loadSequenceRef.current) {
        setLoadFailed(true);
        toast.error("Failed to load data.");
      }
    } finally {
      if (focusedRef.current && sequence === loadSequenceRef.current) setIsLoading(false);
    }
  }, []);

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
    draggingRef.current = false;
    sessionRef.current = order;
    setPositions(null);
    saveOnDropRef.current = false;
    operationRef.current = "arranging";
    void haptics.light();
  }, [dhikrs, haptics, isLoading, loadFailed]);

  const moveDhikr = useCallback((id: number, direction: -1 | 1) => {
    if (draggingRef.current || operationRef.current !== "arranging" || !draftOrderRef.current) return;
    const order = [...draftOrderRef.current];
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    // Update the ref with the preview so rapid taps use the latest order.
    draftOrderRef.current = order;
    setPositions(null);
    setDraftOrder(order);
    sessionRef.current = order;
    void haptics.light();
  }, [haptics]);

  const onDragBegin = useCallback(() => {
    draggingRef.current = true;
    void haptics.light();
  }, [haptics]);

  const onOrderChange = useCallback(({ keyToIndex }: OrderChangeParams) => {
    if (operationRef.current === "arranging" && sessionRef.current === draftOrder) setPositions(keyToIndex);
  }, [draftOrder]);
  const finishArrange = useCallback(async () => {
    if (operationRef.current !== "arranging" || !draftOrderRef.current) return;
    if (draggingRef.current) {
      saveOnDropRef.current = true;
      return;
    }
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
        toast.error("Failed to reorder.", actionErrorOptions);
      } finally {
        operationRef.current = draftOrderRef.current ? "arranging" : "idle";
        setIsSaving(false);
      }
    })();
    pendingSaveRef.current = save;
    await save;
    if (pendingSaveRef.current === save) pendingSaveRef.current = null;
  }, [cancelArrange, dhikrs]);

  const onDragEnd = useCallback(({ indexToKey }: SortableGridDragEndParams<Dhikr>) => {
    if (operationRef.current !== "arranging" || sessionRef.current !== draftOrder) return;
    draggingRef.current = false;
    // The grid already holds these positions. Only Save order needs the final IDs.
    draftOrderRef.current = indexToKey.map(Number);
    if (saveOnDropRef.current) {
      saveOnDropRef.current = false;
      void finishArrange();
    }
  }, [draftOrder, finishArrange]);

  const handleSelect = useCallback(async (dhikr: Dhikr) => {
    if (operationRef.current !== "idle") return;
    try {
      await setSelectedDhikrId(dhikr.id);
    } catch {
      toast.error("Failed to save data.", actionErrorOptions);
      return;
    }
    if (operationRef.current !== "idle" || !focusedRef.current) return;
    void haptics.light();
    router.push("/(dhikr)");
  }, [haptics, router]);

  const handleAdd = useCallback(() => {
    if (operationRef.current !== "idle") return;
    setModal({ visible: true, mode: "add" });
  }, []);

  const handleEdit = useCallback((dhikr: Dhikr) => {
    setModal({ visible: true, mode: "edit", dhikr });
  }, []);

  const handleDelete = useCallback((dhikr: Dhikr) => {
    setModal({ visible: false });
    setDhikrToDelete(dhikr);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!dhikrToDelete) return;
    try {
      await deleteDhikr(dhikrToDelete.id);
      ++loadSequenceRef.current;
      const remaining = dhikrs.filter((item) => item.id !== dhikrToDelete.id);
      setDhikrs(remaining);
      setDhikrToDelete(null);
      try {
        await clearSelectedDhikrIdIfMissing(remaining.map((item) => item.id));
      } catch {
        toast.error("Failed to save data.", actionErrorOptions);
      }
    } catch {
      toast.error("Failed to delete dhikr.", actionErrorOptions);
    }
  }, [dhikrToDelete, dhikrs]);

  const renderRow = useCallback((item: Dhikr, index: number, arrangeRow = false) => (
    <DhikrListRow item={item} index={index} count={displayedDhikrs.length} arranging={arrangeRow} saving={isSaving}
      onMove={moveDhikr} onEdit={handleEdit} onDelete={handleDelete} onSelect={handleSelect} />
  ), [displayedDhikrs.length, handleDelete, handleEdit, handleSelect, isSaving, moveDhikr]);
  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<Dhikr>) => renderRow(item, index), [renderRow]);
  const renderDragItem = useCallback(({ item, index }: SortableGridRenderItemInfo<Dhikr>) =>
    renderRow(item, positions?.[item.id] ?? index, true), [positions, renderRow]);

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="w-full max-w-md flex-1 self-center px-5 pt-4">
          <View className="mb-4 min-h-[48px] flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">{arranging ? "Arrange" : "My Dhikrs"}</Text>
            {arranging ? (
              <View className="max-w-full flex-row flex-wrap items-center gap-x-1">
                <Pressable onPress={cancelArrange} disabled={isSaving}
                  className="min-h-[48px] items-center justify-center rounded-full px-3 active:bg-muted"
                  accessible accessibilityRole="button" accessibilityLabel="Cancel"
                  accessibilityState={{ disabled: isSaving }}>
                  <Text className="text-sm font-medium text-muted-foreground">Cancel</Text>
                </Pressable>
                <Button label={isSaving ? "Saving…" : "Save order"} onPress={finishArrange} busy={isSaving} className="px-4 py-2" />
              </View>
            ) : (
              <View className="max-w-full flex-row flex-wrap items-center gap-x-1">
                {dhikrs.length > 1 && (
                  <Pressable onPress={beginArrange} disabled={isSaving || isLoading || loadFailed}
                    className="min-h-[48px] items-center justify-center rounded-full px-2 active:bg-muted"
                    accessible accessibilityRole="button" accessibilityLabel="Arrange"
                    accessibilityState={{ disabled: isSaving || isLoading || loadFailed }}>
                    <Text className="text-sm font-semibold text-primary">Arrange</Text>
                  </Pressable>
                )}
                <Button label="Add Dhikr" onPress={handleAdd} disabled={isSaving || isLoading} className="px-3 py-2" />
              </View>
            )}
          </View>
          {arranging ? <Animated.ScrollView ref={scrollRef} contentContainerStyle={LIST_CONTENT_STYLE} showsVerticalScrollIndicator={false}>
            <Sortable.Grid
              data={displayedDhikrs}
              keyExtractor={dhikrKey}
              renderItem={renderDragItem}
              scrollableRef={scrollRef}
              customHandle
              sortEnabled={!isSaving}
              dragActivationDelay={0}
              enableActiveItemSnap={false}
              activeItemScale={1}
              activeItemShadowOpacity={0}
              inactiveItemOpacity={1}
              itemEntering={null}
              itemExiting={null}
              dropAnimationDuration={140}
              onDragStart={onDragBegin}
              onOrderChange={onOrderChange}
              onDragEnd={onDragEnd}
            />
          </Animated.ScrollView> : <FlatList
            data={displayedDhikrs}
            keyExtractor={dhikrKey}
            renderItem={renderItem}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            className="flex-1"
            contentContainerStyle={LIST_CONTENT_STYLE}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={isLoading ? (
              <View className="items-center py-12"><ActivityIndicator color={colors.primary} accessibilityLabel="Loading…" /></View>
            ) : loadFailed ? (
              <Card className="items-center gap-3 py-8">
                <Text className="text-sm text-muted-foreground">Failed to load data.</Text>
                <Button label="Retry" onPress={refresh} variant="secondary" />
              </Card>
            ) : (
              <Card className="items-center gap-3 py-8">
                <Text className="text-base font-semibold text-foreground">No dhikrs added yet</Text>
              </Card>
            )}
          />}
        </View>
      </View>
      <ConfirmDialog
        visible={dhikrToDelete !== null}
        title="Delete"
        message={`Delete "${dhikrToDelete?.name ?? ""}"? All counts will be lost.`}
        confirmLabel="Delete"
        destructive
        onClose={() => setDhikrToDelete(null)}
        onConfirm={confirmDelete}
      />
      {modal.visible && (
        <DhikrModal haptics={haptics}
          {...(modal.mode === "add" ? { mode: modal.mode }
            : { mode: modal.mode, dhikr: modal.dhikr })}
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
