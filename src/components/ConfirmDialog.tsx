import { Pressable, Text, Modal, View, ScrollView } from "react-native";
import { useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { X } from "./AppIcons";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import { useI18n } from "../lib/i18n";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const haptics = useHaptics();
  const colors = useThemeColors();
  const themeVariables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmingRef = useRef(false);

  const handleClose = () => {
    if (!confirmingRef.current) onClose();
  };

  const resolvedConfirmLabel = confirmLabel ?? t("confirm");
  const resolvedCancelLabel = cancelLabel ?? t("cancel");

  const handleConfirm = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setIsConfirming(true);
    try {
      void (destructive ? haptics.warning() : haptics.light());
      await onConfirm();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      confirmingRef.current = false;
      setIsConfirming(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-4"
        style={[themeVariables, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        onPress={handleClose}
        accessible={false}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-full w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl"
          accessible={false}
          accessibilityViewIsModal
        >
          <View className="flex-row items-center justify-between">
            <Text accessibilityRole="header" className="flex-1 text-lg font-semibold text-foreground">
              {title}
            </Text>
            <Pressable
              onPress={handleClose}
              disabled={isConfirming}
              accessibilityState={{ disabled: isConfirming }}
              className="ml-2 h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("cancel")}
            >
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView className="mt-2 grow-0" contentContainerClassName="py-1">
            <Text className="text-sm text-muted-foreground">{message}</Text>
          </ScrollView>

          <View className="mt-4 flex-row flex-wrap items-center justify-end gap-3">
            <Pressable
              onPress={handleClose}
              className="min-h-[44px] justify-center rounded-lg px-4 py-2 active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={resolvedCancelLabel}
              accessibilityState={{ disabled: isConfirming }}
              disabled={isConfirming}
            >
              <Text className="text-sm font-medium text-muted-foreground">
                {resolvedCancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleConfirm()}
              disabled={isConfirming}
              className={`min-h-[44px] justify-center rounded-lg px-4 py-2 active:opacity-70 ${destructive ? "bg-destructive" : "bg-primary"} ${isConfirming ? "opacity-60" : ""}`}
              accessible
              accessibilityRole="button"
              accessibilityLabel={resolvedConfirmLabel}
              accessibilityState={{ disabled: isConfirming, busy: isConfirming }}
            >
              <Text
                className={`text-sm font-semibold ${destructive ? "text-destructive-foreground" : "text-primary-foreground"}`}
              >
                {resolvedConfirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
