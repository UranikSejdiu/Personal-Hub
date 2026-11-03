import { Text } from "./ui/Typography";
import { I18nManager, Pressable, View, type LayoutRectangle } from "react-native";
import { useState } from "react";
import Animated, { Easing, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import {
  LayoutDashboard,
  Wallet,
  PiggyBank,
  Calculator,
  Settings,
  ListOrdered,
  FileText,
  Archive,
  CircleHelp,
  CheckSquare,
} from "./AppIcons";
import { cn } from "../lib/utils";
import { useThemeColors } from "../lib/theme";
import type { ComponentType } from "react";

const TAB_HIGHLIGHT_TRANSITION = LinearTransition.duration(200).easing(Easing.bezier(0.2, 0, 0, 1));

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  "view-dashboard": LayoutDashboard,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  calculator: Calculator,
  cog: Settings,
  "format-list-numbered": ListOrdered,
  "note-text": FileText,
  archive: Archive,
  "check-square": CheckSquare,
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
        "flex-row items-center justify-center rounded-[24px] bg-background p-1.5 border border-border/60",
        placement === "inline" ? "w-full" : "absolute left-[16px] right-[16px]"
      )}
      style={placement === "floating" ? { bottom: Math.max(18, insets.bottom + 8) } : undefined}
    >
      {activeLayout && (
        <Animated.View
          pointerEvents="none"
          importantForAccessibility="no"
          layout={TAB_HIGHLIGHT_TRANSITION}
          className="absolute rounded-[17px] bg-secondary"
          style={{
            [I18nManager.isRTL ? "end" : "start"]: activeLayout.x,
            top: activeLayout.y,
            width: activeLayout.width,
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
            className="min-h-[54px] min-w-[44px] flex-1 flex-col items-center justify-center gap-[5px] rounded-[17px] px-0.5 py-[7px] active:opacity-70"
            accessible
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={19} color={isActive ? colors.primary : colors.mutedForeground} />
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
