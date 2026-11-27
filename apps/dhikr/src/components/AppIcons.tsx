import { Text, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
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
export function GripVertical({ size = 24, color = "#000000" }: AppIconProps) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"
      stroke={color} strokeWidth={3.5} strokeLinecap="round" />
  </Svg>;
}
export const ListOrdered = createIcon("ListOrdered");
export const X = createIcon("X");
export const Check = createIcon("Check");
export const CircleHelp = createIcon("CircleHelp");
export const CircleCheck = createIcon("CircleCheck");
export const XCircle = createIcon("XCircle");
export const Info = createIcon("Info");
export const Settings = createIcon("Settings");
export const MoreHorizontal = createIcon("MoreHorizontal");
export const Download = createIcon("Download");
export const Loader2 = createIcon("Loader2");
export const RefreshCw = createIcon("RefreshCw");
export const Rocket = createIcon("Rocket");
