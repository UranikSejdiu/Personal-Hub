import { Text } from "./ui/Typography";
import { type ComponentType } from "react";
import { Pressable, View } from "react-native";
import {
  ChevronDown,
  Wallet,
  Sparkles,
  FileText,
  LayoutGrid,
  CircleHelp,
  ListOrdered,
} from "./AppIcons";
import { AnchoredMenu, useAnchoredMenu } from "./ui/AnchoredMenu";
import { useI18n, type TKey } from "../lib/i18n";
import { useHaptics } from "../hooks/useHaptics";
import { useThemeColors } from "../lib/theme";

const ICON_MAP: Record<string, ComponentType<{ size?: number; color?: string }>> = {
  wallet: Wallet,
  "star-four-points": Sparkles,
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
  const { triggerRef, anchor, open, close } = useAnchoredMenu();

  const activeApp = apps.find((a) => a.id === activeAppId);
  const ActiveIcon = activeApp ? ICON_MAP[activeApp.icon] ?? CircleHelp : LayoutGrid;
  const canSwitch = apps.length > 1;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={() => { void haptics.light(); open(); }}
        disabled={!canSwitch}
        className="min-h-[44px] flex-row items-center gap-2 rounded-xl px-2 py-1.5 active:bg-muted"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("switchApp")}
        accessibilityState={{ expanded: anchor !== null, disabled: !canSwitch }}
      >
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <ActiveIcon size={20} color={colors.primary} />
        </View>
        <Text className="text-base font-semibold text-foreground">
          {activeApp ? t(activeApp.titleKey) : ""}
        </Text>
        {canSwitch ? <ChevronDown size={18} color={colors.mutedForeground} /> : null}
      </Pressable>

      <AnchoredMenu
        anchor={anchor}
        onClose={close}
        size="regular"
        align="start"
        items={apps.map((app) => ({
          key: app.id,
          label: t(app.titleKey),
          icon: ICON_MAP[app.icon] ?? CircleHelp,
          selected: app.id === activeAppId,
          onPress: () => { void haptics.medium(); onAppSelect(app.id); },
        }))}
      />
    </>
  );
}
