import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../../lib/i18n";
import { useThemeVariables } from "../../lib/theme";
import { X } from "../AppIcons";
import { IconButton } from "./Button";
import { Text } from "./Typography";

/** Shared preview sheet, with native keyboard and safe-area handling. */
export function FormDialog({ title, visible = true, busy = false, onClose, children }: {
  title: string; visible?: boolean; busy?: boolean; onClose: () => void; children: ReactNode;
}) {
  const { t } = useI18n();
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const close = () => { if (!busy) onClose(); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView behavior="padding" automaticOffset className="flex-1" style={variables}>
      <Pressable onPress={close} accessible={false} className="flex-1 items-center justify-center bg-black/50 px-4"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
        <Pressable onPress={event => event.stopPropagation()} accessible={false} accessibilityViewIsModal
          className="max-h-full w-full max-w-md overflow-hidden rounded-[22px] border border-border/60 bg-card">
          <View className="flex-row items-center justify-between gap-2 px-[18px] pt-2.5">
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-[22px] font-semibold text-foreground">{title}</Text>
            <IconButton icon={X} accessibilityLabel={t("cancel")} disabled={busy} onPress={close} />
          </View>
          <ScrollView className="grow-0" contentContainerClassName="gap-3 p-[18px]" keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>;
}
