import type { ComponentType } from "react";
import { Pressable, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppIconProps } from "./AppIcons";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";
import { cn } from "../lib/utils";

export interface NavigationDestination {
  id: string;
  label: string;
  icon: ComponentType<AppIconProps>;
}

interface NavigationBarProps {
  tabs: readonly NavigationDestination[];
  activeTabId: string;
  onTabPress: (tabId: string) => void;
}

export function NavigationBar({ tabs, activeTabId, onTabPress }: NavigationBarProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  if (keyboardVisible) return null;

  return (
    <View
      className="bg-surface-container"
      style={{ paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <View accessibilityRole="tablist" className="min-h-[64px] w-full max-w-md flex-row self-center px-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const selected = id === activeTabId;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => onTabPress(id)}
              className="min-w-0 flex-1 items-center justify-center gap-0.5 px-0.5 py-1.5 active:opacity-70"
            >
              <View className={cn("h-7 w-14 max-w-full items-center justify-center rounded-full", selected && "bg-secondary-container")}>
                <Icon size={22} color={selected ? colors.onSecondaryContainer : colors.mutedForeground} />
              </View>
              <Text className={cn("text-center text-label-medium font-medium", selected ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
