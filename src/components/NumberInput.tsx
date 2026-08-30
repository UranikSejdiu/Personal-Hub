import { useState, useCallback, useEffect, startTransition } from "react";
import { TextInput, View, Text } from "react-native";
import { cn } from "../lib/utils";
import { useThemeColors } from "../lib/theme";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

export function NumberInput({
  value,
  onChange,
  placeholder = "0",
  min = -Infinity,
  max = Infinity,
  step = 1,
  decimals = 0,
  suffix,
  className,
}: NumberInputProps) {
  const [text, setText] = useState(value === 0 ? "" : String(value));
  const [isFocused, setIsFocused] = useState(false);
  const colors = useThemeColors();

  useEffect(() => {
    if (!isFocused) {
      startTransition(() => {
        setText(value === 0 ? "" : String(value));
      });
    }
  }, [value, isFocused]);

  const handleChange = useCallback(
    (input: string) => {
      const cleaned = input.replace(/[^0-9.,\-]/g, "").replace(",", ".");
      setText(cleaned);

      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        const clamped = Math.min(max, Math.max(min, num));
        onChange(Number(clamped.toFixed(decimals)));
      }
    },
    [min, max, decimals, onChange]
  );

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    const num = parseFloat(text);
    if (isNaN(num)) {
      setText("");
      onChange(0);
    } else {
      const clamped = Math.min(max, Math.max(min, num));
      onChange(Number(clamped.toFixed(decimals)));
      setText(Number(clamped.toFixed(decimals)).toString());
    }
  }, [text, min, max, decimals, onChange]);

  return (
    <View className={cn("flex-row items-center gap-1", className)}>
      <TextInput
        value={text}
        onChangeText={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        className={cn(
          "flex-1 rounded-xl border px-3 py-2.5 text-base text-foreground bg-card",
          isFocused ? "border-primary" : "border-border"
        )}
        placeholderTextColor={colors.mutedForeground}
      />
      {suffix && (
        <Text className="text-sm text-muted-foreground">{suffix}</Text>
      )}
    </View>
  );
}
