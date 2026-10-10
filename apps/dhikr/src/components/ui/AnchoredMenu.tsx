import { Text } from "./Typography";
import { useCallback, useRef, useState, type ComponentRef, type ComponentType } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, type AppIconProps } from "../AppIcons";
import { useI18n } from "../../lib/i18n";
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
  size?: "regular" | "compact";
  align?: "start" | "end";
}

const EDGE = 8;
const ROW_HEIGHT = 44;
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

export function AnchoredMenu({ anchor, onClose, items, size = "compact", align = "end" }: AnchoredMenuProps) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const themeVariables = useThemeVariables();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const width = Math.min(size === "regular" ? 240 : 200, screenWidth - EDGE * 2);
  const height = items.length * ROW_HEIGHT + MENU_PADDING;
  const preferredLeft = anchor ? (align === "end" ? anchor.x + anchor.width - width : anchor.x) : EDGE;
  const left = Math.max(EDGE, Math.min(preferredLeft, screenWidth - width - EDGE));
  const bottomLimit = screenHeight - insets.bottom - EDGE;
  const topLimit = insets.top + EDGE;
  const below = anchor ? anchor.y + anchor.height + 4 : topLimit;
  const above = anchor ? anchor.y - height - 4 : topLimit;
  const top = below + height <= bottomLimit
    ? below
    : above >= topLimit
      ? above
      : Math.max(topLimit, Math.min(below, bottomLimit - height));

  return (
    <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/30"
        style={themeVariables}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("cancel")}
      >
        {anchor ? (
          <View
            className="absolute rounded-2xl border border-border/60 bg-card p-2 shadow-md"
            style={{ top, left, width }}
            accessibilityViewIsModal
          >
            {items.map((item) => {
              const Icon = item.icon;
              const color = item.destructive ? colors.destructive : item.selected ? colors.primary : colors.mutedForeground;
              return (
                <Pressable
                  key={item.key}
                  onPress={(event) => {
                    event.stopPropagation();
                    onClose();
                    item.onPress();
                  }}
                  className={cn(
                    "min-h-[44px] flex-row items-center rounded-xl active:bg-muted",
                    size === "regular" ? "gap-3 px-3 py-2.5" : "gap-2 px-2 py-1",
                    item.selected && "bg-primary/10"
                  )}
                  accessible
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: item.selected ?? false }}
                >
                  {Icon ? <Icon size={size === "regular" ? 22 : 18} color={color} /> : null}
                  <Text className={cn(
                    "min-w-0 flex-1",
                    size === "regular" ? "text-base" : "text-sm",
                    item.destructive ? "text-destructive" : item.selected ? "font-semibold text-foreground" : "text-foreground"
                  )} numberOfLines={1}>{item.label}</Text>
                  {item.selected ? <Check size={size === "regular" ? 18 : 16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}
