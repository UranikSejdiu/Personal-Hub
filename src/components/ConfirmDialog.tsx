import { Pressable, Text, Modal, View } from "react-native";
import { useState } from "react";
import { X } from "./AppIcons";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";
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
  const { t } = useI18n();
  const [isConfirming, setIsConfirming] = useState(false);

  const resolvedConfirmLabel = confirmLabel ?? t("confirm");
  const resolvedCancelLabel = cancelLabel ?? t("cancel");

  const handleConfirm = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      void (destructive ? haptics.warning() : haptics.light());
      await onConfirm();
    } catch {
      // Error already handled by caller
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-4"
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl"
        >
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-lg font-semibold text-foreground">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              className="ml-2 h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("cancel")}
            >
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Text className="mt-2 text-sm text-muted-foreground">{message}</Text>

          <View className="mt-6 flex-row flex-wrap items-center justify-end gap-3">
            <Pressable
              onPress={onClose}
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
