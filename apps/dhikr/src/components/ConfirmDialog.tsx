import { Text } from "./ui/Typography";
import { AppAlerts } from "./AppAlerts";
import { Pressable, Modal, View, ScrollView } from "react-native";
import { useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { X } from "./AppIcons";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors, useThemeVariables } from "../lib/theme";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  error?: string | null;
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
  error,
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
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmingRef = useRef(false);

  const handleClose = () => {
    if (!confirmingRef.current) onClose();
  };

  const resolvedConfirmLabel = confirmLabel ?? "Confirm";
  const resolvedCancelLabel = cancelLabel ?? "Cancel";

  const handleConfirm = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setIsConfirming(true);
    try {
      void (destructive ? haptics.warning() : haptics.light());
      await onConfirm();
    } catch {
      toast.error("Failed to save.");
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
        className="flex-1 items-center justify-center bg-black/50"
        style={[themeVariables, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}
        onPress={handleClose}
        accessible={false}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-full w-full max-w-sm rounded-2xl bg-card shadow-xl"
          accessible={false}
          accessibilityViewIsModal
        >
          <ScrollView className="min-h-0 grow-0 shrink" contentContainerClassName="p-5">
            <View className="flex-row items-center justify-between">
              <Text accessibilityRole="header" className="min-w-0 flex-1 text-lg font-semibold text-foreground">
                {title}
              </Text>
              <Pressable
                onPress={handleClose}
                disabled={isConfirming}
                accessibilityState={{ disabled: isConfirming }}
                className="ml-2 h-11 w-11 items-center justify-center rounded-lg active:bg-muted"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <X size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text className="mt-2 py-1 text-sm text-muted-foreground">{message}</Text>

            {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="mt-2 text-sm text-destructive">{error}</Text>}

            <View className="mt-4 flex-row flex-wrap items-center justify-end gap-3">
              <Pressable
                onPress={handleClose}
                className="min-h-[44px] max-w-full shrink justify-center rounded-lg px-4 py-2 active:bg-muted"
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
                className={`min-h-[44px] max-w-full shrink justify-center rounded-lg px-4 py-2 active:opacity-70 ${destructive ? "bg-destructive" : "bg-primary"} ${isConfirming ? "opacity-60" : ""}`}
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
          </ScrollView>
        </Pressable>
      </Pressable>
      {visible && <AppAlerts />}
    </Modal>
  );
}
