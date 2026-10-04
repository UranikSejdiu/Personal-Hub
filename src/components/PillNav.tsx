import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import {
  LayoutDashboard,
  Wallet,
  PiggyBank,
  Calculator,
  Settings,
  Sparkles,
  ListOrdered,
  FileText,
  Archive,
  CircleHelp,
} from "./AppIcons";
import { cn } from "../lib/utils";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";
import type { ComponentType } from "react";

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  "view-dashboard": LayoutDashboard,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  calculator: Calculator,
  cog: Settings,
  "star-four-points": Sparkles,
  "format-list-numbered": ListOrdered,
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
  const haptics = useHaptics();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  if (keyboardVisible) return null;

  return (
    <View
      className={cn(
        "flex-row items-center justify-center rounded-full bg-card p-1 shadow-sm border border-border/60",
        placement === "inline" ? "w-full" : "absolute left-4 right-4"
      )}
      style={placement === "floating" ? { bottom: Math.max(16, insets.bottom + 8) } : undefined}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const Icon = ICON_MAP[tab.icon] ?? CircleHelp;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              void haptics.light();
              onTabPress(tab.id);
            }}
            className={cn(
              "min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-1 active:opacity-70",
              isActive && "bg-primary/10"
            )}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={20} color={isActive ? colors.primary : colors.mutedForeground} />
            <Text
              className={cn(
                "text-xs leading-4 text-center",
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
