import { Pressable, View } from "react-native";
import { Text } from "./ui/Typography";

type PreferenceValue = "light" | "dark" | "grid" | "list";

export function PreferenceChoices<T extends PreferenceValue>({ label, options, value, disabled, onChange }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; disabled: boolean; onChange: (value: T) => void;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row gap-1 rounded-[24px] border border-border bg-background p-1">
    {options.map((option) => {
      const selected = value === option.value;
      return <Pressable key={option.value} onPress={() => onChange(option.value)} disabled={disabled}
        accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: selected, disabled }}
        className={`min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-[20px] px-2 py-1 active:opacity-70 disabled:opacity-50 ${selected ? "bg-secondary-container" : ""}`}>
        <Text className={`text-center text-label-large ${selected ? "font-semibold text-on-secondary-container" : "font-medium text-muted-foreground"}`}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}
