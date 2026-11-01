import { useEffect } from "react";
import { BackHandler, Pressable, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { FileText, ListOrdered } from "./AppIcons";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";
import { useI18n, type TKey } from "../lib/i18n";
import type { NoteKind } from "../types/notes";

interface NoteTypeChooserProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: NoteKind) => void;
}

const OPTIONS: {
  kind: NoteKind;
  labelKey: TKey;
  hintKey: TKey;
}[] = [
  { kind: "checklist", labelKey: "notesNewChecklist", hintKey: "notesNewChecklistHint" },
  { kind: "text", labelKey: "notesNewText", hintKey: "notesNewTextHint" },
];

function NoteTypeOption({ option, visible, index, onSelect }: {
  option: (typeof OPTIONS)[number];
  visible: boolean;
  index: number;
  onSelect: (kind: NoteKind) => void;
}) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    const transition = withTiming(visible ? 1 : 0, {
      duration: visible ? 200 : 140,
      reduceMotion: ReduceMotion.System,
    });
    progress.set(visible
      ? withDelay((OPTIONS.length - 1 - index) * 40, transition, ReduceMotion.System)
      : transition);
  }, [visible, index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [
      { translateY: (1 - progress.get()) * 16 },
      { scale: 0.96 + progress.get() * 0.04 },
    ],
  }));
  const Icon = option.kind === "text" ? FileText : ListOrdered;

  return <Animated.View style={animatedStyle} className="max-w-full">
    <Pressable onPress={() => onSelect(option.kind)} disabled={!visible}
      accessibilityRole="button" accessibilityLabel={t(option.labelKey)} accessibilityHint={t(option.hintKey)}
      className="min-h-[48px] max-w-full flex-row items-center gap-3 rounded-full border border-border/60 bg-card px-5 py-3 shadow-md active:opacity-70">
      <Icon size={20} color={colors.primary} />
      <Text className="shrink text-sm font-semibold text-foreground">{t(option.labelKey)}</Text>
    </Pressable>
  </Animated.View>;
}

export function NoteTypeChooser({ visible, onClose, onSelect }: NoteTypeChooserProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  return <View onAccessibilityEscape={onClose} accessibilityLabel={t("notesNew")}
    pointerEvents={visible ? "box-none" : "none"}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    className="mb-4 max-w-full self-end items-end gap-3">
    {OPTIONS.map((option, index) => <NoteTypeOption key={option.kind}
      option={option} visible={visible} index={index} onSelect={onSelect} />)}
  </View>;
}
