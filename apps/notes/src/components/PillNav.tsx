import { Text } from "./ui/Typography";
import { I18nManager, Pressable, View, type LayoutRectangle } from "react-native";
import { useState } from "react";
import Animated, { Easing, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import {
  FileText,
  Archive,
  CircleHelp,
} from "./AppIcons";
import { cn } from "../lib/utils";
import { useThemeColors } from "../lib/theme";
import type { ComponentType } from "react";

const TAB_HIGHLIGHT_TRANSITION = LinearTransition.duration(200).easing(Easing.bezier(0.2, 0, 0, 1));

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  "note-text": FileText,
  archive: Archive,
};

export interface PillNavTab {
  id: string;
  label: string;
  icon: string;
}

interface PillNavProps {
  tabs: PillNavTab[];
  activeTabId: string;
  onTabPress: (tabId: string) => void;
  placement?: "floating" | "inline";
}

export function PillNav({ tabs, activeTabId, onTabPress, placement = "floating" }: PillNavProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const [tabLayouts, setTabLayouts] = useState<Partial<Record<string, LayoutRectangle>>>({});
  const activeLayout = tabLayouts[activeTabId];

  if (keyboardVisible) return null;

  return (
    <View
      className={cn(
        "flex-row items-center justify-center border-t border-border/60 bg-background px-4 pt-2",
        placement === "inline" ? "w-full" : "absolute bottom-0 left-0 right-0"
      )}
      style={{ paddingBottom: Math.max(12, insets.bottom) }}
    >
      {activeLayout && (
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no"
          layout={TAB_HIGHLIGHT_TRANSITION}
          className="absolute rounded-2xl bg-primary/10"
          style={{
            [I18nManager.isRTL ? "end" : "start"]: activeLayout.x + Math.max(0, (activeLayout.width - 120) / 2),
            top: activeLayout.y,
            width: Math.min(120, activeLayout.width),
            height: activeLayout.height,
          }}
        />
      )}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const Icon = ICON_MAP[tab.icon] ?? CircleHelp;
        return (
          <Pressable
            key={tab.id}
            onLayout={({ nativeEvent: { layout } }) => {
              setTabLayouts((previous) => ({ ...previous, [tab.id]: layout }));
            }}
            onPress={() => {

              onTabPress(tab.id);
            }}
            className="min-h-[52px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 active:opacity-70"
            accessible
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={22} color={isActive ? colors.primary : colors.mutedForeground} />
            <Text
              className={cn(
                "text-[11px] leading-4 text-center",
                isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground",
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
