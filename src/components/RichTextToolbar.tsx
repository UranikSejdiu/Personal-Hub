import { View, Pressable, ScrollView } from "react-native";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  CheckSquare,
} from "lucide-react-native";
import type { OnChangeStateEvent } from "react-native-enriched-html";
import { useThemeColors } from "../lib/theme";

interface Props {
  state: OnChangeStateEvent | null;
  onBold: () => void;
  onItalic: () => void;
  onStrikethrough: () => void;
  onUnderline: () => void;
  onH1: () => void;
  onH2: () => void;
  onBulletList: () => void;
  onOrderedList: () => void;
  onCheckboxList: () => void;
}

interface ToolbarButton {
  icon: typeof Bold;
  isActive: (s: OnChangeStateEvent) => boolean;
  isBlocked: (s: OnChangeStateEvent) => boolean;
  onPress: () => void;
}

export function RichTextToolbar({
  state,
  onBold,
  onItalic,
  onStrikethrough,
  onUnderline,
  onH1,
  onH2,
  onBulletList,
  onOrderedList,
  onCheckboxList,
}: Props) {
  const colors = useThemeColors();

  const buttons: ToolbarButton[] = [
    { icon: Bold, isActive: (s) => s.bold.isActive, isBlocked: (s) => s.bold.isBlocking, onPress: onBold },
    { icon: Italic, isActive: (s) => s.italic.isActive, isBlocked: (s) => s.italic.isBlocking, onPress: onItalic },
    { icon: Strikethrough, isActive: (s) => s.strikeThrough.isActive, isBlocked: (s) => s.strikeThrough.isBlocking, onPress: onStrikethrough },
    { icon: Underline, isActive: (s) => s.underline.isActive, isBlocked: (s) => s.underline.isBlocking, onPress: onUnderline },
    { icon: Heading1, isActive: (s) => s.h1.isActive, isBlocked: (s) => s.h1.isBlocking, onPress: onH1 },
    { icon: Heading2, isActive: (s) => s.h2.isActive, isBlocked: (s) => s.h2.isBlocking, onPress: onH2 },
    { icon: List, isActive: (s) => s.unorderedList.isActive, isBlocked: (s) => s.unorderedList.isBlocking, onPress: onBulletList },
    { icon: ListOrdered, isActive: (s) => s.orderedList.isActive, isBlocked: (s) => s.orderedList.isBlocking, onPress: onOrderedList },
    { icon: CheckSquare, isActive: (s) => s.checkboxList.isActive, isBlocked: (s) => s.checkboxList.isBlocking, onPress: onCheckboxList },
  ];

  return (
    <View className="border-t border-border bg-card px-2 py-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
        {buttons.map((btn, i) => {
          const active = state ? btn.isActive(state) : false;
          const blocked = state ? btn.isBlocked(state) : false;
          const Icon = btn.icon;
          return (
            <Pressable
              key={i}
              onPress={btn.onPress}
              disabled={blocked}
              className={`h-9 w-9 items-center justify-center rounded-lg ${
                active ? "bg-primary" : blocked ? "opacity-30" : "bg-muted"
              }`}
            >
              <Icon size={18} color={active ? colors.primaryForeground : colors.foreground} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
