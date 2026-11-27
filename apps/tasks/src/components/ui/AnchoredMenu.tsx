import { Text } from "./Typography";
import { AppAlerts } from "../AppAlerts";
import { useCallback, useRef, useState, type ComponentRef, type ComponentType } from "react";
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, type AppIconProps } from "../AppIcons";
import { useThemeColors, useThemeVariables } from "../../lib/theme";
import { cn } from "../../lib/utils";

export interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchoredMenuItem {
  key: string;
  label: string;
  icon?: ComponentType<AppIconProps>;
  onPress: () => void;
  selected?: boolean;
  destructive?: boolean;
}

interface AnchoredMenuProps {
  anchor: MenuAnchor | null;
  onClose: () => void;
  items: AnchoredMenuItem[];
  align?: "start" | "end";
}

const EDGE = 8;
const ROW_HEIGHT = 48;
const MENU_PADDING = 16;

export function useAnchoredMenu() {
  const triggerRef = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  const open = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) setAnchor({ x, y, width, height });
    });
  }, []);
  const close = useCallback(() => setAnchor(null), []);

  return { triggerRef, anchor, open, close };
}

export function AnchoredMenu({ anchor, onClose, items, align = "end" }: AnchoredMenuProps) {
  const pendingAction = useRef<(() => void) | null>(null);
  const colors = useThemeColors();
  const variables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const marginLeft = EDGE + insets.left, marginRight = EDGE + insets.right;
  const width = Math.min(208, screenWidth - marginLeft - marginRight);
  const maxHeight = Math.max(ROW_HEIGHT, screenHeight - insets.top - insets.bottom - EDGE * 2);
  const height = Math.min(items.length * ROW_HEIGHT + MENU_PADDING, maxHeight);
  const preferredLeft = anchor ? (align === "end" ? anchor.x + anchor.width - width : anchor.x) : EDGE;
  const left = Math.max(marginLeft, Math.min(preferredLeft, screenWidth - width - marginRight));
  const bottomLimit = screenHeight - insets.bottom - EDGE;
  const topLimit = insets.top + EDGE;
  const below = anchor ? anchor.y + anchor.height + 4 : topLimit;
  const above = anchor ? anchor.y - height - 4 : topLimit;
  const top = below + height <= bottomLimit
    ? below
    : above >= topLimit
      ? above
      : Math.max(topLimit, Math.min(below, bottomLimit - height));

  if (!anchor && Platform.OS !== "ios") return null;
  return (
    <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={onClose} onDismiss={() => {
      const action = pendingAction.current;
      pendingAction.current = null;
      action?.();
    }}>
      <View className="flex-1" style={variables}>
        <Pressable className="absolute inset-0 bg-black/20"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
        />
        {anchor ? (
          <View
            className="absolute rounded-[20px] bg-surface-container-high p-2 shadow-md"
            style={{ top, left, width, maxHeight }}
            accessibilityViewIsModal
          >
            <ScrollView style={{ maxHeight: Math.max(ROW_HEIGHT, maxHeight - MENU_PADDING) }} keyboardShouldPersistTaps="handled">
              {items.map((item) => {
                const Icon = item.icon;
                const color = item.destructive ? colors.destructive : item.selected ? colors.onSecondaryContainer : colors.mutedForeground;
                return (
                  <Pressable
                    key={item.key}
                    onPress={(event) => {
                      event.stopPropagation();
                      // iOS must dismiss this modal before presenting a confirmation.
                      if (Platform.OS === "ios") pendingAction.current = item.onPress;
                      onClose();
                      if (Platform.OS !== "ios") item.onPress();
                    }}
                    className={cn(
                      "min-h-[48px] flex-row items-center rounded-[12px] gap-2 px-3 py-1 active:bg-secondary",
                      item.destructive && "border-t border-border",
                      item.selected && "bg-secondary-container"
                    )}
                    accessible
                    accessibilityRole="menuitem"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: item.selected ?? false }}
                  >
                    {Icon ? <Icon size={18} color={color} /> : null}
                    <Text className={cn(
                      "min-w-0 flex-1 text-sm",
                      item.destructive ? "text-destructive" : item.selected ? "font-semibold text-on-secondary-container" : "text-foreground"
                    )} numberOfLines={1}>{item.label}</Text>
                    {item.selected ? <Check size={16} color={colors.onSecondaryContainer} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
      {anchor !== null && <AppAlerts />}
    </Modal>
  );
}
