import { Text, TextInput } from "./ui/Typography";
import { useCallback, useRef, useState } from "react";
import { View, Pressable, Modal, ScrollView } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { X } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NumberInput } from "./NumberInput";
import { type Dhikr, addDhikr, updateDhikr } from "../lib/dhikr";

interface BaseProps {
  onClose: () => void;
  onSave: (d: Dhikr) => Promise<void> | void;
  haptics?: ReturnType<typeof import("../hooks/useHaptics").useHaptics>;
}

type Props = BaseProps & (
  | { mode: "add"; dhikr?: never }
  | { mode: "edit"; dhikr: Dhikr }
);

export function DhikrModal(props: Props) {
  const { mode, dhikr, onClose, onSave, haptics } = props;
  const { t } = useI18n();
  const colors = useThemeColors();
  const themeVariables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(dhikr?.name ?? "");
  const [limit, setLimit] = useState(dhikr?.daily_limit ?? 0);
  const [totalCount, setTotalCount] = useState(dhikr?.total_count ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const handleClose = useCallback(() => { if (!savingRef.current) onClose(); }, [onClose]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    if (!name.trim()) {
      setError(t("errorNoName"));
      return;
    }
    if (!Number.isSafeInteger(limit) || limit < 0) {
      setError(t("errorLimitPositive"));
      return;
    }
    if (mode === "edit" && (!Number.isSafeInteger(totalCount) || totalCount < 0)) {
      setError(t("errorTotalCount"));
      return;
    }
    const lim = limit > 0 ? limit : null;
    setError("");
    savingRef.current = true;
    setSaving(true);
    try {
      if (mode === "add") {
        const created = await addDhikr(name.trim(), lim);
        void haptics?.light();
        await onSave(created);
      } else if (mode === "edit") {
        await updateDhikr(dhikr.id, {
          name: name.trim(),
          daily_limit: lim,
          total_count: totalCount,
        });
        void haptics?.light();
        await onSave({ ...dhikr, name: name.trim(), daily_limit: lim, total_count: totalCount });
      }
    } catch {
      setError(t("errorSavingData"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [mode, name, limit, totalCount, dhikr, onSave, haptics, t]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView className="flex-1" behavior="padding" automaticOffset>
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-4"
        onPress={handleClose}
        style={[themeVariables, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-full w-full max-w-sm overflow-hidden rounded-2xl bg-card"
        >
          <ScrollView className="grow-0" keyboardShouldPersistTaps="handled" contentContainerClassName="p-4">
          <View className="flex-row items-center justify-between">
            <Text accessibilityRole="header" className="flex-1 text-lg font-semibold text-foreground">
              {mode === "add" ? t("newDhikr") : t("editDhikr")}
            </Text>
            <Pressable onPress={handleClose} disabled={saving} className="h-11 w-11 items-center justify-center rounded-full active:bg-muted" accessible accessibilityRole="button" accessibilityLabel={t("cancel")}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {error ? (
            <Text accessibilityRole="alert" className="mt-2 text-sm text-destructive">{error}</Text>
          ) : null}

          <View className="mt-3 gap-3">
            <View>
              <Text className="ml-1 text-sm font-medium text-muted-foreground">
                {t("nameLabel")}
              </Text>
              <TextInput
                editable={!saving}
                accessibilityLabel={t("nameLabel")}
                autoFocus
                value={name}
                onChangeText={setName}
                placeholder={t("namePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
              />
            </View>

            <View>
              <Text className="ml-1 text-sm font-medium text-muted-foreground">
                {t("limitLabel")}
              </Text>
              <NumberInput
                value={limit}
                onChange={setLimit}
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                disabled={saving}
                accessibilityLabel={t("limitLabel")}
                placeholder={t("limitPlaceholder")}
              />
              <Text className="mt-1.5 text-xs text-muted-foreground">{t("dailyLimitHelp")}</Text>
            </View>
            {mode === "edit" && (
              <View>
                <Text className="ml-1 text-sm font-medium text-muted-foreground">
                  {t("totalCountLabel")}
                </Text>
                <NumberInput
                  value={totalCount}
                  onChange={setTotalCount}
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  disabled={saving}
                  accessibilityLabel={t("totalCountLabel")}
                  placeholder="0"
                />
              </View>
            )}
          </View>

          <View className="mt-4 flex-row items-center justify-end gap-2">
            <Pressable onPress={handleClose} disabled={saving} className="min-h-[44px] justify-center rounded-lg px-3 py-2 active:bg-muted" accessible accessibilityRole="button" accessibilityLabel={t("cancel")}>
              <Text className="text-sm font-medium text-muted-foreground">
                {t("cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleSave();
              }}
              disabled={saving}
              className="min-h-[44px] justify-center rounded-lg bg-primary px-4 py-2 active:opacity-70"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("save")}
              accessibilityState={{ disabled: saving, busy: saving }}
            >
              <Text className="text-sm font-medium text-primary-foreground">
                {t(saving ? "saving" : "saveBtn")}
              </Text>
            </Pressable>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
