import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
} from "lucide-react-native";
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

  return (
    <View
      className="absolute left-4 right-4 flex-row items-center justify-center rounded-full bg-card/95 px-2 py-2 shadow-lg border border-border/50"
      style={{ bottom: Math.max(16, insets.bottom + 8) }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const Icon = ICON_MAP[tab.icon] ?? CircleHelp;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              haptics.light();
              onTabPress(tab.id);
            }}
            className={cn(
              "flex-1 flex-col items-center justify-center gap-1 rounded-full py-2.5",
              isActive && "bg-primary"
            )}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={20} color={isActive ? colors.primaryForeground : colors.mutedForeground} />
            <Text
              className={cn(
                "text-xs font-medium",
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
