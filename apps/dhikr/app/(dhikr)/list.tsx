import { Text } from "../../src/components/ui/Typography";
import { memo, useState, useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, BackHandler, Pressable, View, type ListRenderItemInfo } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { MoreHorizontal, ChevronDown, Pencil, Trash2, type AppIconProps } from "../../src/components/AppIcons";
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

const ROW_TRANSITION = LinearTransition.duration(180);
const LIST_CONTENT_STYLE = { paddingBottom: 24 };
const dhikrKey = (item: Dhikr) => String(item.id);

function MoveUpIcon(props: AppIconProps) {
  return <View className="rotate-180"><ChevronDown {...props} /></View>;
}

function applyOrder(items: Dhikr[], order: number[]): Dhikr[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) =>
    (positions.get(a.id) ?? positions.size) - (positions.get(b.id) ?? positions.size)
  );
}

const DhikrListRow = memo(function DhikrListRow({ item, index, count, arranging, saving, onMove, onEdit, onDelete, onSelect }: {
  item: Dhikr;
  index: number;
  count: number;
  arranging: boolean;
  saving: boolean;
  onMove: (id: number, direction: -1 | 1) => void;
  onEdit: (dhikr: Dhikr) => void;
  onDelete: (dhikr: Dhikr) => void;
  onSelect: (dhikr: Dhikr) => void;
}) {
  const haptics = useHaptics();
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const dailyLimit = item.daily_limit;
  const hasGoal = dailyLimit != null && dailyLimit > 0;
  const goalComplete = hasGoal && item.daily_count >= dailyLimit;

  return (
    <View className={`border-x border-border/60 bg-card px-3 ${index === 0 ? "rounded-t-2xl border-t" : ""} ${index === count - 1 ? "rounded-b-2xl border-b" : ""}`}>
      <View className={`py-3 ${index < count - 1 ? "border-b border-border/60" : ""}`}>
      <View className="flex-row items-center gap-2">
        {arranging && (
          <Text className="w-5 text-sm font-medium text-muted-foreground">{index + 1}</Text>
        )}
        <Pressable
          onPress={() => onSelect(item)}
          disabled={arranging || saving}
          className="min-h-[56px] min-w-0 flex-1 justify-center gap-1.5 rounded-lg py-1 active:opacity-70"
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}`}
          accessibilityState={{ disabled: arranging || saving }}
        >
          <Text className="text-[15px] font-semibold text-foreground">{item.name}</Text>
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-xs text-muted-foreground">Total: {item.total_count.toLocaleString("en")}</Text>
            <View className="max-w-full flex-row flex-wrap items-center gap-1">
              <Text className="text-xs text-muted-foreground">Today</Text>
              <Text className={goalComplete ? "shrink text-xs font-semibold text-success" : "shrink text-xs font-semibold text-primary"}>
                {item.daily_count.toLocaleString("en")}{hasGoal ? ` / ${dailyLimit.toLocaleString("en")}` : ""}
              </Text>
            </View>
          </View>
        </Pressable>
        {arranging ? (
          <View className="flex-row rounded-xl bg-muted/40">
            <IconButton icon={MoveUpIcon} onPress={() => onMove(item.id, -1)}
              disabled={saving || index === 0}
              accessibilityLabel={`Move ${item.name} up`} />
            <IconButton icon={ChevronDown} onPress={() => onMove(item.id, 1)}
              disabled={saving || index === count - 1}
              accessibilityLabel={`Move ${item.name} down`} />
          </View>
        ) : (
          <View ref={triggerRef} collapsable={false}>
            <IconButton icon={MoreHorizontal} onPress={() => { void haptics.light(); open(); }} disabled={saving}
              selected={anchor !== null}
              accessibilityLabel={`Actions for ${item.name}`}
              accessibilityState={{ expanded: anchor !== null }} />
          </View>
        )}
      </View>
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
        toast.error("Failed to reorder.");
      } finally {
        operationRef.current = draftOrderRef.current ? "arranging" : "idle";
        setIsSaving(false);
      }
    })();
    pendingSaveRef.current = save;
    await save;
    if (pendingSaveRef.current === save) pendingSaveRef.current = null;
  }, [cancelArrange, dhikrs]);

  const handleSelect = useCallback(async (dhikr: Dhikr) => {
    if (operationRef.current !== "idle") return;
    try {
      await setSelectedDhikrId(dhikr.id);
    } catch {
      toast.error("Failed to save data.");
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
        toast.error("Failed to save data.");
      }
    } catch {
      toast.error("Failed to delete dhikr.");
    }
  }, [dhikrToDelete, dhikrs]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<Dhikr>) => (
    <DhikrListRow item={item} index={index} count={displayedDhikrs.length} arranging={arranging} saving={isSaving}
      onMove={moveDhikr} onEdit={handleEdit} onDelete={handleDelete} onSelect={handleSelect} />
  ), [arranging, displayedDhikrs.length, handleDelete, handleEdit, handleSelect, isSaving, moveDhikr]);

  return (
    <>
      <View className="flex-1 bg-background">
        <View className="w-full max-w-md flex-1 self-center px-4 pt-3">
          <View className="mb-3 min-h-[44px] flex-row flex-wrap items-center justify-between gap-2">
            <Text accessibilityRole="header" className="text-title-large font-medium text-foreground">{arranging ? "Arrange" : "My Dhikrs"}</Text>
            {arranging ? (
              <View className="flex-row items-center gap-1">
                <Pressable onPress={cancelArrange} disabled={isSaving}
                  className="min-h-[44px] items-center justify-center rounded-lg px-3 active:bg-muted"
                  accessible accessibilityRole="button" accessibilityLabel="Cancel"
                  accessibilityState={{ disabled: isSaving }}>
                  <Text className="text-sm font-medium text-muted-foreground">Cancel</Text>
                </Pressable>
                <Button label={isSaving ? "Saving…" : "Done"} onPress={finishArrange} busy={isSaving} className="px-4 py-2" />
              </View>
            ) : (
              <View className="flex-row items-center gap-1">
                {dhikrs.length > 1 && (
                  <Pressable onPress={beginArrange} disabled={isSaving || isLoading || loadFailed}
                    className="min-h-[44px] items-center justify-center rounded-lg px-2 active:bg-muted"
                    accessible accessibilityRole="button" accessibilityLabel="Arrange"
                    accessibilityState={{ disabled: isSaving || isLoading || loadFailed }}>
                    <Text className="text-sm font-semibold text-primary">Arrange</Text>
                  </Pressable>
                )}
                <Button label="Add Dhikr" onPress={handleAdd} disabled={isSaving || isLoading} className="px-3 py-2" />
              </View>
            )}
          </View>
          <Animated.FlatList
            data={displayedDhikrs}
            keyExtractor={dhikrKey}
            renderItem={renderItem}
            itemLayoutAnimation={arranging ? ROW_TRANSITION : undefined}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            skipEnteringExitingAnimations
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
          />
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
