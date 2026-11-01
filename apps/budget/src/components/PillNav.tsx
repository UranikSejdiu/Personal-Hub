import { Text } from "./ui/Typography";
import { Pressable, View } from "react-native";
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

  if (keyboardVisible) return null;

  return (
    <View
      className={cn(
        "flex-row items-center justify-center rounded-[24px] bg-background p-1.5 border border-border/60",
        placement === "inline" ? "w-full" : "absolute left-[16px] right-[16px]"
      )}
      style={placement === "floating" ? { bottom: Math.max(18, insets.bottom + 8) } : undefined}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const Icon = ICON_MAP[tab.icon] ?? CircleHelp;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {

              onTabPress(tab.id);
            }}
            className={cn(
              "min-h-[54px] min-w-[44px] flex-1 flex-col items-center justify-center gap-[5px] rounded-[17px] px-0.5 py-[7px] active:opacity-70",
              isActive && "bg-secondary"
            )}
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
