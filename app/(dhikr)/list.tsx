import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import { Sparkles, Plus, Pencil, Trash2, GripVertical } from "lucide-react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { toast } from "sonner-native";
import { useI18n } from "../../src/lib/i18n";
import { useHaptics } from "../../src/hooks/useHaptics";
import {
  loadDhikrs,
  deleteDhikr,
  reorderDhikrs,
  type Dhikr,
} from "../../src/lib/dhikr";
import {
  setSelectedDhikrId,
} from "../../src/lib/dhikrSelection";
import { DhikrModal } from "../../src/components/DhikrModal";
import { useThemeColors } from "../../src/lib/theme";
import DraggableFlatList, {
  type RenderItemParams,
  type DragEndParams,
} from "react-native-draggable-flatlist";

type ModalState =
  | { visible: false }
  | { visible: true; mode: "add" | "edit"; dhikr?: Dhikr };

function DhikrDraggableRow({
  item: d,
  drag,
  isActive,
  colors,
  t,
  onEdit,
  onDelete,
  onSelect,
}: {
  item: Dhikr;
  drag: () => void;
  isActive: boolean;
  colors: ReturnType<typeof useThemeColors>;
  t: ReturnType<typeof useI18n>["t"];
  onEdit: (d: Dhikr) => void;
  onDelete: (d: Dhikr) => void;
  onSelect: (d: Dhikr) => void;
}) {
  return (
    <View
      style={[
        styles.rowBase,
        isActive && { backgroundColor: colors.card, opacity: 0.9 },
      ]}
      className="rounded-xl border border-border bg-card px-3 py-3"
    >
      <Pressable
        onLongPress={drag}
        delayLongPress={150}
        className="shrink-0 items-center justify-center px-1 py-2"
        accessibilityLabel={t("reorderHandle")}
      >
        <GripVertical size={18} color={colors.mutedForeground} />
      </Pressable>

      <Pressable
        onPress={() => onSelect(d)}
        className="flex-1 min-w-0"
        accessibilityLabel={t("openDhikr")}
      >
        <Text
          className="text-base font-semibold text-foreground"
          numberOfLines={1}
        >
          {d.name}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">
            {t("total")}: {d.total_count.toLocaleString()}
          </Text>
          {d.daily_limit != null && d.daily_limit > 0 && (
            <Text className="text-xs font-semibold text-primary">
              {d.daily_count}/{d.daily_limit}
            </Text>
          )}
        </View>
        {d.daily_limit != null && d.daily_limit > 0 && (
          <View className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <View
              className={`h-full rounded-full ${
                d.daily_count >= d.daily_limit ? "bg-success" : "bg-primary"
              }`}
              style={{
                width: `${Math.min(
                  100,
                  (d.daily_count / d.daily_limit) * 100
                )}%`,
              }}
            />
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={() => onEdit(d)}
        className="shrink-0 p-2"
        accessibilityLabel={t("editDhikr")}
      >
        <Pencil size={18} color={colors.mutedForeground} />
      </Pressable>
      <Pressable
        onPress={() => {
          void onDelete(d);
        }}
        className="shrink-0 p-2"
        accessibilityLabel={t("delete")}
      >
        <Trash2 size={18} color={colors.destructive} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBase: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});

export default function DhikrListScreen() {
  const { t } = useI18n();
  const haptics = useHaptics();
  const colors = useThemeColors();
  const router = useRouter();
  const [dhikrs, setDhikrs] = useState<Dhikr[]>([]);
  const [modal, setModal] = useState<ModalState>({ visible: false });

  const refresh = useCallback(() => {
    void loadDhikrs().then(setDhikrs);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const handleSelect = useCallback(
    (d: Dhikr) => {
      void setSelectedDhikrId(d.id);
      void haptics.light();
      router.push("/(dhikr)");
    },
    [haptics, router]
  );

  const handleAdd = useCallback(() => {
    setModal({ visible: true, mode: "add" });
  }, []);

  const handleEdit = useCallback((dhikr: Dhikr) => {
    setModal({ visible: true, mode: "edit", dhikr });
  }, []);

  const handleDelete = useCallback(
    (dhikr: Dhikr) => {
      Alert.alert(
        t("deleteConfirmTitle"),
        t("deleteConfirmBody", { name: dhikr.name }),
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("delete"),
            style: "destructive",
            onPress: async () => {
              try {
                await deleteDhikr(dhikr.id);
                setDhikrs((prev) => prev.filter((d) => d.id !== dhikr.id));
              } catch {
                toast.error(t("errorDeletingDhikr"));
              }
            },
          },
        ]
      );
    },
    [t]
  );

  const handleDragEnd = useCallback(
    async (updated: Dhikr[]) => {
      const prev = dhikrs;
      setDhikrs(updated);
      try {
        await reorderDhikrs(updated.map((d) => d.id));
        void haptics.light();
      } catch {
        toast.error(t("errorReordering"));
        setDhikrs(prev);
      }
    },
    [dhikrs, haptics, t]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<Dhikr>) => (
      <DhikrDraggableRow
        item={item}
        drag={drag}
        isActive={isActive}
        colors={colors}
        t={t}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onSelect={handleSelect}
      />
    ),
    [colors, handleDelete, handleEdit, handleSelect, t]
  );

  const renderBody =
    dhikrs.length === 0 ? (
      <View className="items-center gap-2 py-12">
        <Sparkles size={40} color={colors.mutedForeground} />
        <Text className="text-sm text-muted-foreground">
          {t("noDhikrsAdded")}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {t("tapNewToCreate")}
        </Text>
      </View>
    ) : (
      <DraggableFlatList
        data={dhikrs}
        keyExtractor={(item) => item.id.toString()}
        onDragEnd={({ data }: DragEndParams<Dhikr>) => void handleDragEnd(data)}
        renderItem={renderItem}
        activationDistance={10}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 112, gap: 8 }}
      />
    );

  const renderModal = modal.visible ? (
    <DhikrModal
      mode={modal.mode}
      dhikr={modal.dhikr}
      onClose={() => setModal({ visible: false })}
      onSave={(d) => {
        if (modal.mode === "add") {
          setDhikrs((prev) => [...prev, d]);
          void haptics.light();
          void router.push("/(dhikr)");
        } else {
          setDhikrs((prev) =>
            prev.map((item) => (item.id === d.id ? d : item))
          );
        }
        setModal({ visible: false });
      }}
    />
  ) : null;

  return (
    <>
      <ScrollView className="flex-1 bg-background">
        <View className="w-full max-w-md self-center gap-3 p-4 pb-28">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">
              {t("myDhikrs")}
            </Text>
            <Pressable
              onPress={handleAdd}
              className="flex-row items-center gap-1 rounded-lg bg-primary px-3 py-1.5"
            >
              <Plus size={14} color={colors.primaryForeground} />
              <Text className="text-sm font-medium text-primary-foreground">
                {t("addDhikrBtn")}
              </Text>
            </Pressable>
          </View>
          {renderBody}
        </View>
      </ScrollView>
      {renderModal}
    </>
  );
}
