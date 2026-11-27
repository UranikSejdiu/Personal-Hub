import { Text } from "./ui/Typography";
import { AppAlerts } from "./AppAlerts";
import { Pressable, Modal, View, ScrollView } from "react-native";
import { useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { useThemeVariables } from "../lib/theme";
import { Button } from "./ui/Button";

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
  const themeVariables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  if (!visible && confirmError) setConfirmError("");
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

      await onConfirm();
      setConfirmError("");
    } catch {
      setConfirmError("The action failed. Try again.");
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
          className="max-h-full w-full max-w-md overflow-hidden rounded-[28px] bg-surface-container-high"
          accessible={false}
          accessibilityViewIsModal
        >
          <ScrollView className="min-h-0 grow-0 shrink" contentContainerClassName="p-6">
            <Text accessibilityRole="header" className="text-title-large font-medium text-foreground">
              {title}
            </Text>
            <Text className="mt-3 text-body-medium text-muted-foreground">{message}</Text>

            {(error || confirmError) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="mt-2 text-sm text-destructive">{error || confirmError}</Text>}

            <View className="mt-5 flex-row flex-wrap items-center justify-end gap-2">
              <Button className="max-w-full shrink" label={resolvedCancelLabel} variant="text" disabled={isConfirming} onPress={handleClose} />
              <Button className="max-w-full shrink" label={resolvedConfirmLabel} variant={destructive ? "destructive" : "primary"}
                busy={isConfirming} onPress={() => void handleConfirm()} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      {visible && <AppAlerts />}
    </Modal>
  );
}
