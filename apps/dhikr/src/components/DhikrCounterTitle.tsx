import { memo, useLayoutEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Text } from "./ui/Typography";

const LINE_HEIGHT = 24;
const SWITCH_DURATION = 180;
const FADE_IN = FadeIn.duration(SWITCH_DURATION).reduceMotion(ReduceMotion.System);

export const DhikrCounterTitle = memo(function DhikrCounterTitle({ name }: { name: string }) {
  const { fontScale } = useWindowDimensions();
  const minimumHeight = 2 * Math.ceil(LINE_HEIGHT * fontScale) + 2;
  const height = useSharedValue(minimumHeight);
  const measured = useRef(false);
  const currentName = useRef(name);
  useLayoutEffect(() => { currentName.current = name; }, [name]);
  const animatedHeight = useAnimatedStyle(() => ({ height: height.get() }));

  return (
    <Animated.View className="w-full overflow-hidden" style={animatedHeight}>
      {/* Measure at the final width, independently of the animated viewport height. */}
      <Animated.View key={name} entering={FADE_IN}
        style={{ position: "absolute", left: 0, right: 0, top: 0, minHeight: minimumHeight, justifyContent: "center" }}
        onLayout={({ nativeEvent }) => {
          if (currentName.current !== name) return;
          const target = Math.ceil(nativeEvent.layout.height);
          height.set(measured.current
            ? withTiming(target, { duration: SWITCH_DURATION, reduceMotion: ReduceMotion.System })
            : target);
          measured.current = true;
        }}>
        <Text className="w-full text-center font-semibold text-foreground"
          style={{ fontSize: 18, lineHeight: LINE_HEIGHT, includeFontPadding: false }}>
          {name}
        </Text>
      </Animated.View>
    </Animated.View>
  );
});
