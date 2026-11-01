import { Text } from "./ui/Typography";
import { Pressable, View } from "react-native";
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

  if (keyboardVisible) return null;

  return (
    <View
      className={cn(
        "flex-row items-center justify-center border-t border-border/60 bg-background px-4 pt-2",
        placement === "inline" ? "w-full" : "absolute bottom-0 left-0 right-0"
      )}
      style={{ paddingBottom: Math.max(12, insets.bottom) }}
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
              "min-h-[52px] min-w-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 active:opacity-70"
            )}
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
