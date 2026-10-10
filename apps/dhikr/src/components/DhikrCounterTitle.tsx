import { Text } from "./ui/Typography";
import { memo, useState } from "react";
import { useWindowDimensions } from "react-native";

function MeasuredTitle({ name }: { name: string }) {
  const [multiline, setMultiline] = useState(false);

  return (
    <Text
      className={`w-full min-w-0 text-center font-semibold text-foreground ${multiline ? "text-base leading-6" : "text-lg leading-7"}`}
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

export const DhikrCounterTitle = memo(function DhikrCounterTitle({ name }: { name: string }) {
  const { width, fontScale } = useWindowDimensions();
  return <MeasuredTitle key={`${name}:${width}:${fontScale}`} name={name} />;
});
