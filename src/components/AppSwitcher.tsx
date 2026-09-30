import {
  useCallback,
  useRef,
  useState,
  type ComponentRef,
  type ComponentType,
} from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import {
  Check,
  ChevronDown,
  Wallet,
  Sparkles,
  FileText,
  LayoutGrid,
  CircleHelp,
} from "./AppIcons";
import { cn } from "../lib/utils";
import { useI18n, type TKey } from "../lib/i18n";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  wallet: Wallet,
  "star-four-points": Sparkles,
  "note-text": FileText,
  apps: LayoutGrid,
};

const MENU_WIDTH = 240;
const EDGE_MARGIN = 8;

export interface AppInfo {
  id: string;
  titleKey: TKey;
  icon: string;
}

interface AppSwitcherProps {
  apps: AppInfo[];
  activeAppId: string;
  onAppSelect: (appId: string) => void;
}

interface MenuAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function AppSwitcher({ apps, activeAppId, onAppSelect }: AppSwitcherProps) {
  const { t } = useI18n();
  const haptics = useHaptics();
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  const activeApp = apps.find((a) => a.id === activeAppId);
  const ActiveIcon = activeApp ? ICON_MAP[activeApp.icon] ?? CircleHelp : LayoutGrid;

  const open = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    haptics.light();
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, [haptics]);

  const close = useCallback(() => setAnchor(null), []);

  // Keep the menu on-screen when the trigger sits near the right edge.
  const menuLeft = anchor
    ? Math.min(
        Math.max(anchor.x, EDGE_MARGIN),
        Math.max(EDGE_MARGIN, windowWidth - MENU_WIDTH - EDGE_MARGIN)
      )
    : EDGE_MARGIN;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={open}
        className="flex-row items-center gap-2 px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={t("switchApp")}
        accessibilityState={{ expanded: anchor !== null }}
      >
        <ActiveIcon size={22} color={colors.foreground} />
        <Text className="text-base font-semibold text-foreground">
          {activeApp ? t(activeApp.titleKey) : ""}
        </Text>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable
          className="flex-1 bg-black/30"
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("cancel")}
        >
          {anchor ? (
            <View
              className="absolute rounded-2xl border border-border/50 bg-card p-2 shadow-xl"
              style={{ top: anchor.y + anchor.height + 4, left: menuLeft, width: MENU_WIDTH }}
            >
              {apps.map((app) => {
                const isActive = app.id === activeAppId;
                const Icon = ICON_MAP[app.icon] ?? CircleHelp;
                return (
                  <Pressable
                    key={app.id}
                    onPress={(event) => {
                      event.stopPropagation();
                      haptics.medium();
                      onAppSelect(app.id);
                      close();
                    }}
                    className={cn(
                      "flex-row items-center gap-3 rounded-xl px-3 py-3",
                      isActive && "bg-accent"
                    )}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Icon size={22} color={isActive ? colors.foreground : colors.mutedForeground} />
                    <Text
                      className={cn(
                        "flex-1 text-base",
                        isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {t(app.titleKey)}
                    </Text>
                    {isActive ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
