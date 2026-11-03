import { Stack } from "expo-router";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/lib/theme";

export const unstable_settings = { initialRouteName: "(tabs)" };

export default function NotesLayout() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const detailAnimation = reducedMotion ? "none" : "slide_from_right";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editor" options={{ animation: detailAnimation }} />
        <Stack.Screen name="checklist" options={{ animation: detailAnimation }} />
        <Stack.Screen name="settings" />
      </Stack>
    </View>
  );
}
