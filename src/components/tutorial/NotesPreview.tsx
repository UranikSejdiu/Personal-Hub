import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

export function NotesPreview() {
  const slide1 = useSharedValue(0);
  const slide2 = useSharedValue(0);
  const slide3 = useSharedValue(0);

  useEffect(() => {
    slide1.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    slide2.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
      -1, true
    );
    slide3.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
      -1, true
    );
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: slide1.value, transform: [{ translateY: (1 - slide1.value) * 15 }] }));
  const s2 = useAnimatedStyle(() => ({ opacity: slide2.value, transform: [{ translateY: (1 - slide2.value) * 15 }] }));
  const s3 = useAnimatedStyle(() => ({ opacity: slide3.value, transform: [{ translateY: (1 - slide3.value) * 15 }] }));

  return (
    <View className="mx-4 gap-3">
      <View className="flex-row items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Text className="text-xs text-muted-foreground">🔍</Text>
        <Text className="text-xs text-muted-foreground">Search notes...</Text>
      </View>
      <Animated.View style={s1} className="rounded-xl border border-border bg-yellow-100 p-3 dark:bg-yellow-900/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">Shopping List</Text>
          <Text className="text-[10px] text-muted-foreground">📌</Text>
        </View>
        <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>Milk, eggs, bread, butter...</Text>
      </Animated.View>
      <Animated.View style={s2} className="rounded-xl border border-border bg-green-100 p-3 dark:bg-green-900/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">Meeting Notes</Text>
        </View>
        <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>Action items from today's standup</Text>
      </Animated.View>
      <Animated.View style={s3} className="rounded-xl border border-border bg-blue-100 p-3 dark:bg-blue-900/30">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-foreground">Ideas</Text>
        </View>
        <Text className="mt-1 text-xs text-muted-foreground" numberOfLines={1}>App feature brainstorm...</Text>
      </Animated.View>
    </View>
  );
}
