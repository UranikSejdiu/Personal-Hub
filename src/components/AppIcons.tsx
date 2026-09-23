import { Text, type TextStyle } from "react-native";
import { UICON_GLYPHS, type UiconName } from "../constants/uicons";

export interface AppIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

function createIcon(name: UiconName) {
  return function AppIcon({ size = 24, color = "#000000", className }: AppIconProps) {
    const style: TextStyle = {
      color,
      fontFamily: "Uicons",
      fontSize: size,
      lineHeight: size * 1.15,
      textAlign: "center",
    };
    return <Text className={className} style={style}>{UICON_GLYPHS[name]}</Text>;
  };
}

export const Trash2 = createIcon("Trash2");
export const Plus = createIcon("Plus");
export const ChevronDown = createIcon("ChevronDown");
export const Landmark = createIcon("Landmark");
export const CreditCard = createIcon("CreditCard");
export const Save = createIcon("Save");
export const ChevronRight = createIcon("ChevronRight");
export const CircleCheck = createIcon("CircleCheck");
export const ArrowDownLeft = createIcon("ArrowDownLeft");
export const ArrowUpRight = createIcon("ArrowUpRight");
export const Archive = createIcon("Archive");
export const ChevronLeft = createIcon("ChevronLeft");
export const Sparkles = createIcon("Sparkles");
export const Star = createIcon("Star");
export const RotateCcw = createIcon("RotateCcw");
export const Pencil = createIcon("Pencil");
export const GripVertical = createIcon("GripVertical");
export const ArrowLeft = createIcon("ArrowLeft");
export const Pin = createIcon("Pin");
export const PinOff = createIcon("PinOff");
export const Bold = createIcon("Bold");
export const Italic = createIcon("Italic");
export const Strikethrough = createIcon("Strikethrough");
export const List = createIcon("List");
export const ListOrdered = createIcon("ListOrdered");
export const CheckSquare = createIcon("CheckSquare");
export const FileText = createIcon("FileText");
export const Search = createIcon("Search");
export const XCircle = createIcon("XCircle");
export const X = createIcon("X");
export const Check = createIcon("Check");
export const Copy = createIcon("Copy");
export const Repeat = createIcon("Repeat");
export const Rocket = createIcon("Rocket");
export const Loader2 = createIcon("Loader2");
export const RefreshCw = createIcon("RefreshCw");
export const Info = createIcon("Info");
export const Palette = createIcon("Palette");
export const Vibrate = createIcon("Vibrate");
export const Target = createIcon("Target");
export const Cloud = createIcon("Cloud");
export const Download = createIcon("Download");
export const BookOpen = createIcon("BookOpen");
export const Wallet = createIcon("Wallet");
export const LayoutGrid = createIcon("LayoutGrid");
export const CircleHelp = createIcon("CircleHelp");
export const LayoutDashboard = createIcon("LayoutDashboard");
export const PiggyBank = createIcon("PiggyBank");
export const Calculator = createIcon("Calculator");
export const Settings = createIcon("Settings");
