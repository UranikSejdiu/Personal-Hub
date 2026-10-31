import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./ui/Typography";
export function HubHeader(_props: { activeAppId: string; onAppSelect: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  return <View className="bg-background" style={{ paddingTop: insets.top }}><View className="w-full max-w-md self-center px-4 py-3"><Text accessibilityRole="header" className="text-xl font-semibold text-foreground">Notes</Text></View></View>;
}
