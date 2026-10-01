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
}

export function PillNav({ tabs, activeTabId, onTabPress }: PillNavProps) {
  const haptics = useHaptics();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  if (keyboardVisible) return null;

  return (
    <View
      className="absolute left-4 right-4 flex-row items-center justify-center rounded-full bg-card/95 p-1 shadow-lg border border-border/50"
      style={{ bottom: Math.max(16, insets.bottom + 8) }}
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
              "min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 active:opacity-70",
              isActive && "bg-primary"
            )}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={18} color={isActive ? colors.primaryForeground : colors.mutedForeground} />
            <Text
              className={cn(
                "text-xs font-medium leading-4 text-center",
                isActive ? "text-primary-foreground" : "text-muted-foreground",
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
