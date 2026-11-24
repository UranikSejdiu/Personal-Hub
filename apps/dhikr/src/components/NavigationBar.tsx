import type { ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
      style={{
        backgroundColor: colors.background,
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View accessibilityRole="tablist" className="min-h-[56px] w-full max-w-md flex-row self-center px-2">
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
              <View
                style={[
                  styles.tabIndicator,
                  selected && { backgroundColor: colors.primary },
                ]}
              >
                <Icon size={20} color={selected ? colors.primaryForeground : colors.mutedForeground} />
              </View>
              <Text className={cn("text-center text-label-medium", selected ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabIndicator: {
    width: 48,
    maxWidth: "100%",
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
});
