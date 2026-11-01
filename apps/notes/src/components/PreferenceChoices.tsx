import { Pressable, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";

type PreferenceIcon = "light" | "dark" | "grid" | "list";

function PreferenceSymbol({ name, color }: { name: PreferenceIcon; color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
    {name === "light" && <><Circle cx={12} cy={12} r={4} /><Path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></>}
    {name === "dark" && <Path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" />}
    {name === "grid" && <><Rect x={3} y={3} width={7} height={8} rx={1.5} /><Rect x={14} y={3} width={7} height={5} rx={1.5} /><Rect x={3} y={15} width={7} height={6} rx={1.5} /><Rect x={14} y={12} width={7} height={9} rx={1.5} /></>}
    {name === "list" && <><Rect x={3} y={3} width={18} height={7} rx={1.5} /><Rect x={3} y={14} width={18} height={7} rx={1.5} /><Path d="M7 6.5h10M7 17.5h10" /></>}
  </Svg>;
}

export function PreferenceChoices<T extends PreferenceIcon>({ label, options, value, disabled, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; disabled: boolean; onChange: (value: T) => void;
}) {
  const colors = useThemeColors();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row gap-1 rounded-[20px] bg-secondary p-1">
    {options.map(option => {
      const selected = value === option.value;
      return <Pressable key={option.value} onPress={() => onChange(option.value)} disabled={disabled}
        accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: selected, disabled }}
        className={`min-h-[64px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[16px] px-2 py-3 active:opacity-70 disabled:opacity-50 ${selected ? "bg-action" : ""}`}>
        <PreferenceSymbol name={option.value} color={selected ? colors.actionForeground : colors.mutedForeground} />
        <Text className={`text-center text-sm font-semibold ${selected ? "text-action-foreground" : "text-muted-foreground"}`}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
