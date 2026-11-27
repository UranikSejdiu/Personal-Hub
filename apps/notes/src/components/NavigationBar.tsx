import type { ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import type { AppIconProps } from "./AppIcons";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";
import { usePageMargins } from "../lib/usePageMargins";
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
  const pageMargins = usePageMargins();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  if (keyboardVisible) return null;

  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: 4,
        paddingBottom: insets.bottom + 8,
      }}
    >
      <View
        accessibilityRole="tablist"
        style={[styles.track, pageMargins, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const selected = id === activeTabId;
          const color = selected ? colors.primaryForeground : colors.mutedForeground;
          return (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => onTabPress(id)}
              className="active:opacity-70"
              style={styles.tab}
            >
              {selected && (
                <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
                  <Svg width="100%" height="100%">
                    <Rect width="100%" height="100%" rx={28} ry={28} fill={colors.primary} />
                  </Svg>
                </View>
              )}
              <Icon size={20} color={color} />
              <Text className={cn("text-center text-label-medium", selected ? "font-semibold" : "font-medium")} style={{ color }}>
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
  track: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderRadius: 36,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
});
