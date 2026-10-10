import { Text } from "./ui/Typography";
import { useState, type ComponentType } from "react";
import { Pressable, View } from "react-native";
import {
  ChevronDown,
  Wallet,
  FileText,
  LayoutGrid,
  CircleHelp,
  ListOrdered,
} from "./AppIcons";
import { ActionDialog } from "./ui/ActionDialog";
import { useI18n, type TKey } from "../lib/i18n";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  wallet: Wallet,
  "note-text": FileText,
  apps: LayoutGrid,
  "list-check": ListOrdered,
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
  const [menuOpen, setMenuOpen] = useState(false);

  const activeApp = apps.find((a) => a.id === activeAppId);
  const ActiveIcon = activeApp ? ICON_MAP[activeApp.icon] ?? CircleHelp : LayoutGrid;
  const canSwitch = apps.length > 1;

  return (
    <>
      <Pressable
        onPress={() => { void haptics.light(); setMenuOpen(true); }}
        disabled={!canSwitch}
        className="min-h-[44px] flex-row items-center gap-2 rounded-[13px] bg-secondary px-[9px] py-[5px] active:opacity-70"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("switchApp")}
        accessibilityState={{ expanded: menuOpen, disabled: !canSwitch }}
      >
        <View className="h-[30px] w-[30px] items-center justify-center">
          <ActiveIcon size={20} color={colors.primary} />
        </View>
        <Text className="text-base font-semibold text-foreground">
          {activeApp ? t(activeApp.titleKey) : ""}
        </Text>
        {canSwitch ? <ChevronDown size={16} color={colors.mutedForeground} /> : null}
      </Pressable>

      <ActionDialog visible={menuOpen} title={t("switchApp")} layout="list" onClose={() => setMenuOpen(false)}
        actions={apps.map(app => ({ key: app.id, label: t(app.titleKey), icon: ICON_MAP[app.icon] ?? CircleHelp,
          selected: app.id === activeAppId, onPress: () => { void haptics.medium(); onAppSelect(app.id); } }))} />
    </>
  );
}
