import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import type { AttachmentAction } from "../lib/attachmentData";
import { toolbarFeedback } from "../lib/toolbarFeedback";
import { Plus, X } from "./AppIcons";
import { AttachmentIcon } from "./AttachmentIcons";
import { AppAlerts } from "./AppAlerts";
import { Text } from "./ui/Typography";

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
  const { height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const pendingRef = useRef<AttachmentAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(visible ? 1 : 0, { duration: 180, reduceMotion: ReduceMotion.System }));
  }, [visible, progress]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.get() * 45}deg` }] }));

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
  const maxHeight = Math.max(0, screenHeight - insets.top - insets.bottom - 32);

  return <>
      <Pressable onPress={() => {
        if (pendingRef.current) return;
        toolbarFeedback();
        Keyboard.dismiss();
        setVisible(true);
      }} disabled={disabled || busy}
        accessibilityRole="button" accessibilityLabel="Add attachment" accessibilityHint="Choose an image, camera, voice recording, or file"
        accessibilityState={{ expanded: visible, disabled: disabled || busy, busy }}
        className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70 disabled:opacity-50">
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Animated.View style={iconStyle}><Plus size={24} color={colors.foreground} /></Animated.View>}
      </Pressable>
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent
      animationType={reducedMotion ? "none" : "fade"} onRequestClose={close} onDismiss={commitSelection}>
      <View className="flex-1 justify-end px-4" style={[variables, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={close} style={StyleSheet.absoluteFill} className="bg-black/40"
          accessibilityRole="button" accessibilityLabel="Close attachment menu" />
        {visible && <Animated.View entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
          className="w-full max-w-md self-center overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-lg"
          style={{ maxHeight }} accessibilityViewIsModal onAccessibilityEscape={close}>
            <View className="flex-row items-center justify-between gap-3 px-5 pb-2 pt-3">
              <Text accessibilityRole="header" className="min-w-0 flex-1 text-lg font-semibold text-foreground">Add attachment</Text>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close attachment menu"
                className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70">
                <X size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView className="grow-0 shrink" keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}>
              {OPTIONS.map(option =>
                <Pressable onPress={() => select(option.kind)} accessibilityRole="button" accessibilityLabel={option.label}
                  key={option.kind} className="min-h-[56px] flex-row items-center gap-3 rounded-2xl px-3 py-2 active:bg-secondary">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                    <AttachmentIcon name={option.kind} size={21} color={colors.primary} />
                  </View>
                  <Text className="min-w-0 flex-1 text-base font-medium text-foreground">{option.label}</Text>
                </Pressable>
              )}
            </ScrollView>
        </Animated.View>}
      </View>
      {visible && <AppAlerts />}
    </Modal>
  </>;
}
