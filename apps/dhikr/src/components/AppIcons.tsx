import { Text, type TextStyle } from "react-native";
import { UICON_GLYPHS, type UiconName } from "../constants/uicons";

export interface AppIconProps {
  size?: number;
  color?: string;
  className?: string;
}

function createIcon(name: UiconName) {
  return function AppIcon({ size = 24, color = "#000000", className }: AppIconProps) {
    const style: TextStyle = {
      color,
      fontFamily: "Uicons",
      fontWeight: "normal",
      fontStyle: "normal",
      fontSize: size,
      lineHeight: size * 1.15,
      textAlign: "center",
    };
    return <Text className={className} style={style}>{UICON_GLYPHS[name]}</Text>;
  };
}

export const Trash2 = createIcon("Trash2");
export const ChevronDown = createIcon("ChevronDown");
export const ChevronRight = createIcon("ChevronRight");
export const ChevronLeft = createIcon("ChevronLeft");
export const Sparkles = createIcon("Sparkles");
export const Star = createIcon("Star");
export const RotateCcw = createIcon("RotateCcw");
export const Pencil = createIcon("Pencil");
export const ListOrdered = createIcon("ListOrdered");
export const X = createIcon("X");
export const Check = createIcon("Check");
export const CircleHelp = createIcon("CircleHelp");
export const Settings = createIcon("Settings");
export const MoreHorizontal = createIcon("MoreHorizontal");
export const Download = createIcon("Download");
export const Loader2 = createIcon("Loader2");
export const RefreshCw = createIcon("RefreshCw");
export const Rocket = createIcon("Rocket");
