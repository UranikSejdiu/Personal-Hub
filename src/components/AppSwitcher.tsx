import { useState } from "react";
import { Pressable, Text, Modal } from "react-native";
import {
  ChevronDown,
  Wallet,
  Sparkles,
  FileText,
  LayoutGrid,
  CircleHelp,
} from "lucide-react-native";
import { cn } from "../lib/utils";
import { useI18n, type TKey } from "../lib/i18n";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";
import type { ComponentType } from "react";

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  wallet: Wallet,
  "star-four-points": Sparkles,
  "note-text": FileText,
  apps: LayoutGrid,
};

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

export function AppSwitcher({ apps, activeAppId, onAppSelect }: AppSwitcherProps) {
  const { t } = useI18n();
  const haptics = useHaptics();
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);

  const activeApp = apps.find((a) => a.id === activeAppId);
  const ActiveIcon = activeApp ? ICON_MAP[activeApp.icon] ?? CircleHelp : LayoutGrid;

  return (
    <>
      <Pressable
        onPress={() => {
          haptics.light();
          setVisible(true);
        }}
        className="flex-row items-center gap-2 px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={t("switchApp")}
      >
        <ActiveIcon size={22} color={colors.foreground} />
        <Text className="text-base font-semibold text-foreground">
          {activeApp ? t(activeApp.titleKey) : ""}
        </Text>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center"
          onPress={() => setVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-2 mx-8 w-64 shadow-xl border border-border/50"
          >
            {apps.map((app) => {
              const isActive = app.id === activeAppId;
              const Icon = ICON_MAP[app.icon] ?? CircleHelp;
              return (
                <Pressable
                  key={app.id}
                  onPress={() => {
                    haptics.medium();
                    onAppSelect(app.id);
                    setVisible(false);
                  }}
                  className={cn(
                    "flex-row items-center gap-3 px-4 py-3 rounded-xl",
                    isActive && "bg-accent"
                  )}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isActive }}
                >
                  <Icon size={22} color={isActive ? colors.foreground : colors.mutedForeground} />
                  <Text
                    className={cn(
                      "text-base",
                      isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {t(app.titleKey)}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
