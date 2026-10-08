import { useState, useCallback } from "react";
import { TextInput, View, Text } from "react-native";
import { cn } from "../lib/utils";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { parseNumberInput } from "../lib/numberInput";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  accessibilityLabel?: string;
}

export function NumberInput({
  value,
  onChange,
  placeholder = "0",
  min = -Infinity,
  max = Infinity,
  decimals = 0,
  suffix,
  className,
  accessibilityLabel,
}: NumberInputProps) {
  const [text, setText] = useState(value === 0 ? "" : String(value));
  const [isFocused, setIsFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const colors = useThemeColors();
  const { t } = useI18n();

  const displayText = isFocused || invalid ? text : value === 0 ? "" : String(value);

  const handleFocus = useCallback(() => {
    if (!invalid) setText(value === 0 ? "" : String(value));
    setIsFocused(true);
  }, [invalid, value]);

  const handleChange = useCallback(
    (input: string) => {
      setText(input);
      const num = parseNumberInput(input, decimals);
      setInvalid(num === null);
      if (num !== null) {
        const clamped = Math.min(max, Math.max(min, num));
        onChange(Number(clamped.toFixed(decimals)));
      }
    },
    [min, max, decimals, onChange]
  );

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const num = parseNumberInput(text, decimals);
    setInvalid(num === null);
    if (num === null) {
      return;
    } else {
      const clamped = Math.min(max, Math.max(min, num));
      onChange(Number(clamped.toFixed(decimals)));
      setText(Number(clamped.toFixed(decimals)).toString());
    }
  }, [text, min, max, decimals, onChange]);

  return (
    <View className={className}>
      <View className="flex-row items-center gap-1">
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={displayText}
        onChangeText={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        className={cn(
          "flex-1 rounded-xl border px-3 py-2.5 text-base text-foreground bg-card",
          invalid ? "border-destructive" : isFocused ? "border-primary" : "border-border"
        )}
        placeholderTextColor={colors.mutedForeground}
      />
      {suffix && (
        <Text className="text-sm text-muted-foreground">{suffix}</Text>
      )}
      </View>
      {invalid ? <Text accessibilityRole="alert" className="mt-1 text-xs text-destructive">{t("numberInputInvalid")}</Text> : null}
    </View>
  );
}
