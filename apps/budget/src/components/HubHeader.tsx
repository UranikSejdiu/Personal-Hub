import { Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./ui/Typography";
export function HubHeader() {
  const insets = useSafeAreaInsets();
  return <View className="bg-background" style={{ paddingTop: insets.top }}><View className="w-full max-w-md self-center flex-row items-center gap-2.5 px-5 py-3"><Image source={require("../../assets/branding/icon.png")} style={{ width: 34, height: 34, borderRadius: 11 }} accessible={false} /><Text accessibilityRole="header" className="text-lg font-bold tracking-[-0.4px] text-foreground">MoneyPlan</Text></View></View>;
}
