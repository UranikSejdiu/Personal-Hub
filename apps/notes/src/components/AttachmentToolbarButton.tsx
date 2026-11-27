import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import type { AttachmentAction } from "../lib/attachmentData";
import { toolbarFeedback } from "../lib/toolbarFeedback";
import { X } from "./AppIcons";
import { AttachmentIcon } from "./AttachmentIcons";
import { AppAlerts } from "./AppAlerts";
import { PopMenuOption } from "./PopMenuOption";
import { usePageMargins } from "../lib/usePageMargins";

const OPTIONS = [
  { kind: "file", label: "Attach file" },
  { kind: "audio", label: "Record voice" },
  { kind: "camera", label: "Take photo" },
  { kind: "image", label: "Choose image" },
] as const;

export function AttachmentToolbarButton({ disabled, busy, onSelect }: {
  disabled: boolean; busy: boolean; onSelect: (kind: AttachmentAction) => void;
}) {
  const [visible, setVisible] = useState(false);
  const colors = useThemeColors();
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const { marginLeft, marginRight } = usePageMargins();
  const { width, height } = useWindowDimensions();
  const triggerRef = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const measureTrigger = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      if (w && h) setAnchor({ x, y });
    });
  }, []);
  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(measureTrigger);
    const keyboard = Keyboard.addListener("keyboardDidHide", measureTrigger);
    return () => { cancelAnimationFrame(frame); keyboard.remove(); };
  }, [visible, width, height, measureTrigger]);
  const pendingRef = useRef<AttachmentAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const commitSelection = () => {
    const kind = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (kind) onSelect(kind);
  };
  const close = () => setVisible(false);
  const select = (kind: AttachmentAction) => {
    if (pendingRef.current || disabled || busy) return;
    toolbarFeedback();
    pendingRef.current = kind;
    close();
    // iOS waits for its modal to disappear before presenting a native picker.
    if (Platform.OS !== "ios") timerRef.current = setTimeout(commitSelection, 180);
  };
  const top = insets.top + 8;

  return <>
      <Pressable ref={triggerRef} collapsable={false} onPress={() => {
        if (pendingRef.current) return;
        toolbarFeedback();
        setAnchor(null);
        measureTrigger();
        Keyboard.dismiss();
        setVisible(true);
      }} disabled={disabled || busy}
        accessibilityRole="button" accessibilityLabel="Add attachment" accessibilityHint="Choose an image, camera, voice recording, or file"
        accessibilityState={{ expanded: visible, disabled: disabled || busy, busy }}
        className="h-12 w-12 shrink-0 items-center justify-center rounded-full active:bg-secondary disabled:opacity-50">
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : visible
          ? <X size={21} color={colors.foreground} />
          : <AttachmentIcon name="file" size={21} color={colors.foreground} />}
      </Pressable>
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent
      animationType="none" onShow={measureTrigger} onRequestClose={close} onDismiss={commitSelection}>
      <View className="flex-1" style={variables} accessibilityViewIsModal onAccessibilityEscape={close}>
        <Pressable onPress={close} style={StyleSheet.absoluteFill}
          accessibilityRole="button" accessibilityLabel="Close attachment menu" />
        {visible && anchor && <View pointerEvents="box-none" className="absolute items-start justify-end"
          style={{ top, left: Math.max(marginLeft, anchor.x), right: marginRight, height: Math.max(0, anchor.y - top - 12) }}>
          <ScrollView className="max-w-full grow-0 shrink" keyboardShouldPersistTaps="always"
            contentContainerClassName="items-start gap-3">
            {OPTIONS.map((option, index) => <PopMenuOption key={option.kind} label={option.label}
              icon={<AttachmentIcon name={option.kind} size={20} color={colors.primary} />}
              visible={visible} distanceFromTrigger={OPTIONS.length - 1 - index} onPress={() => select(option.kind)} />)}
          </ScrollView>
        </View>}
      </View>
      {visible && <AppAlerts />}
    </Modal>
  </>;
}
