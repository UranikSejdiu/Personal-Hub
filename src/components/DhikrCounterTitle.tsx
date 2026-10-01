import { useState } from "react";
import { Text, useWindowDimensions } from "react-native";

function MeasuredTitle({ name }: { name: string }) {
  const [multiline, setMultiline] = useState(false);

  return (
    <Text
      className={`min-w-0 flex-1 text-center font-semibold text-foreground ${multiline ? "text-lg leading-6" : "text-xl leading-7"}`}
      onTextLayout={({ nativeEvent }) => {
        // Keep the smaller size once wrapping is detected, even if it fits on
        // one line at that size. Otherwise the two sizes can oscillate.
        if (nativeEvent.lines.length > 1) setMultiline(true);
      }}
    >
      {name}
    </Text>
  );
}

export function DhikrCounterTitle({ name }: { name: string }) {
  const { width, fontScale } = useWindowDimensions();
  return <MeasuredTitle key={`${name}:${width}:${fontScale}`} name={name} />;
}
