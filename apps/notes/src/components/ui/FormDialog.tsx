import type { ReactNode } from "react";
import { AppAlerts } from "../AppAlerts";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeVariables } from "../../lib/theme";
import { usePageMargins } from "../../lib/usePageMargins";
import { X } from "../AppIcons";
import { IconButton } from "./Button";
import { Text } from "./Typography";

/** Shared preview sheet, with native keyboard and safe-area handling. */
export function FormDialog({ title, visible = true, busy = false, onClose, children, placement = "center" }: {
  title: string; visible?: boolean; busy?: boolean; onClose: () => void; children: ReactNode; placement?: "center" | "bottom";
}) {
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const { marginLeft, marginRight } = usePageMargins();
  const close = () => { if (!busy) onClose(); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView behavior="padding" automaticOffset className="flex-1" style={variables}>
      <Pressable onPress={close} accessible={false} className={`flex-1 items-center bg-black/50 ${placement === "bottom" ? "justify-end" : "justify-center"}`}
        style={{
          paddingTop: insets.top + 16,
          paddingBottom: placement === "bottom" ? 0 : insets.bottom + 16,
          paddingLeft: marginLeft,
          paddingRight: marginRight,
        }}>
        <Pressable onPress={event => event.stopPropagation()} accessible={false} accessibilityViewIsModal
          className={`max-h-full w-full overflow-hidden bg-surface-container-high ${placement === "bottom" ? "rounded-t-[28px]" : "rounded-[28px]"}`}
          style={placement === "bottom" ? { paddingBottom: Math.max(12, insets.bottom) } : undefined}>
          <ScrollView className="min-h-0 grow-0 shrink" keyboardShouldPersistTaps="handled">
            <View className="flex-row items-center justify-between gap-2 px-[18px] pt-2.5">
              <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-medium text-foreground">{title}</Text>
              <IconButton icon={X} accessibilityLabel="Cancel" disabled={busy} onPress={close} />
            </View>
            <View className="gap-3 p-[18px]">{children}</View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    {visible && <AppAlerts />}
  </Modal>;
}
