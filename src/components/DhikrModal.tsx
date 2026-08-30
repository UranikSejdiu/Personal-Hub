import { useCallback, useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { X } from "lucide-react-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { NumberInput } from "./NumberInput";
import { type Dhikr, addDhikr, updateDhikr } from "../lib/dhikr";

interface Props {
  mode: "add" | "edit";
  dhikr?: Dhikr;
  onClose: () => void;
  onSave: (d: Dhikr) => Promise<void> | void;
  haptics?: ReturnType<typeof import("../hooks/useHaptics").useHaptics>;
}

export function DhikrModal({ mode, dhikr, onClose, onSave, haptics }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [name, setName] = useState(dhikr?.name ?? "");
  const [limit, setLimit] = useState(dhikr?.daily_limit ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError(t("errorNoName"));
      return;
    }
    const lim = limit > 0 ? limit : null;
    if (lim !== null && (Number.isNaN(lim) || lim <= 0)) {
      setError(t("errorLimitPositive"));
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (mode === "add") {
        const created = await addDhikr(name.trim(), lim);
        void haptics?.light();
        await onSave(created);
      } else if (dhikr) {
        await updateDhikr(dhikr.id, {
          name: name.trim(),
          daily_limit: lim,
        });
        void haptics?.light();
        await onSave({ ...dhikr, name: name.trim(), daily_limit: lim });
      }
    } catch {
      setError(t("errorLoadingData"));
    } finally {
      setSaving(false);
    }
  }, [mode, name, limit, dhikr, onSave, haptics, t]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-4"
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl bg-card p-5"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-foreground">
              {mode === "add" ? t("newDhikr") : t("editDhikr")}
            </Text>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {error ? (
            <Text className="mt-2 text-sm text-red-500">{error}</Text>
          ) : null}

          <View className="mt-4 gap-4">
            <View>
              <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">
                {t("nameLabel")}
              </Text>
              <TextInput
                autoFocus
                value={name}
                onChangeText={setName}
                placeholder={t("namePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
              />
            </View>

            <View>
              <Text className="ml-1 text-xs font-semibold tracking-wider text-muted-foreground">
                {t("limitLabel")}
              </Text>
              <NumberInput
                value={limit}
                onChange={setLimit}
                min={0}
                step={1}
                placeholder={t("limitPlaceholder")}
              />
            </View>
          </View>

          <View className="mt-5 flex-row items-center justify-end gap-2">
            <Pressable onPress={onClose} className="px-2 py-1">
              <Text className="text-sm font-medium text-muted-foreground">
                {t("cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleSave();
              }}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2"
            >
              <Text className="text-sm font-medium text-primary-foreground">
                {t("saveBtn")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
