import { useEffect, useRef } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useThemeColors, useThemeVariables } from "../lib/theme";
import type { AttachmentAction } from "../lib/attachmentData";
import { toolbarFeedback } from "../lib/toolbarFeedback";
import { Plus } from "./AppIcons";
import { AttachmentIcon } from "./AttachmentIcons";
import { AppAlerts } from "./AppAlerts";
import { Text } from "./ui/Typography";
import { useAnchoredMenu } from "./ui/AnchoredMenu";

const OPTIONS = [
  { kind: "file", label: "Attach file" },
  { kind: "audio", label: "Record voice" },
  { kind: "camera", label: "Take photo" },
  { kind: "image", label: "Choose image" },
] as const;

export function AttachmentToolbarButton({ disabled, busy, onSelect }: {
  disabled: boolean; busy: boolean; onSelect: (kind: AttachmentAction) => void;
}) {
  const { triggerRef, anchor, open, close } = useAnchoredMenu();
  const colors = useThemeColors();
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const pendingRef = useRef<AttachmentAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(anchor ? 1 : 0, { duration: 180, reduceMotion: ReduceMotion.System }));
  }, [anchor, progress]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.get() * 45}deg` }] }));

  const commitSelection = () => {
    const kind = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (kind) onSelect(kind);
  };
  const select = (kind: AttachmentAction) => {
    toolbarFeedback();
    pendingRef.current = kind;
    close();
    // iOS waits for its modal to disappear before presenting a native picker.
    if (Platform.OS !== "ios") timerRef.current = setTimeout(commitSelection, 180);
  };
  const width = Math.min(224, screenWidth - 16);
  const maxHeight = Math.max(48, (anchor?.y ?? 0) - insets.top - 20);
  const height = Math.min(244, maxHeight);
  const left = Math.max(8, Math.min(anchor?.x ?? 8, screenWidth - width - 8));
  const top = Math.max(insets.top + 8, (anchor?.y ?? 0) - height - 12);

  return <>
    <View ref={triggerRef} collapsable={false}>
      <Pressable onPress={() => { toolbarFeedback(); open(); }} disabled={disabled || busy}
        accessibilityRole="button" accessibilityLabel="Add attachment" accessibilityHint="Choose an image, camera, voice recording, or file"
        accessibilityState={{ expanded: anchor !== null, disabled: disabled || busy, busy }}
        className="h-11 w-11 items-center justify-center rounded-full bg-secondary active:opacity-70 disabled:opacity-50">
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Animated.View style={iconStyle}><Plus size={24} color={colors.foreground} /></Animated.View>}
      </Pressable>
    </View>
    <Modal visible={anchor !== null} transparent statusBarTranslucent navigationBarTranslucent
      animationType={reducedMotion ? "none" : "fade"} onRequestClose={close} onDismiss={commitSelection}>
      <View className="flex-1" style={variables}>
        <Pressable onPress={close} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close attachment menu" />
        {anchor && <>
          <View style={{ position: "absolute", left, top, width, maxHeight: height }} accessibilityViewIsModal onAccessibilityEscape={close}>
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 8 }}>
              {OPTIONS.map((option, index) => <Animated.View key={option.kind}
                entering={FadeInDown.duration(180).delay((OPTIONS.length - 1 - index) * 30).reduceMotion(ReduceMotion.System)} className="self-start">
                <Pressable onPress={() => select(option.kind)} accessibilityRole="button" accessibilityLabel={option.label}
                  className="min-h-[48px] flex-row items-center gap-3 rounded-full border border-border/60 bg-card px-4 py-3 shadow-md active:opacity-70">
                  <AttachmentIcon name={option.kind} size={20} color={colors.primary} />
                  <Text className="shrink text-sm font-semibold text-foreground">{option.label}</Text>
                </Pressable>
              </Animated.View>)}
            </ScrollView>
          </View>
        </>}
      </View>
      {anchor && <AppAlerts />}
    </Modal>
  </>;
}
