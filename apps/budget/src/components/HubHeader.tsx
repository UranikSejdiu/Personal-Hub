import { Image, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./ui/Typography";
export function HubHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View className="bg-background" style={{ paddingTop: insets.top }}>
      <View className="min-h-[64px] w-full max-w-md flex-row items-center gap-3 self-center px-4 py-2">
        <Image source={require("../../assets/branding/icon.png")} className="h-8 w-8 rounded-lg" accessible={false} />
        <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-medium text-foreground">MoneyPlan</Text>
      </View>
    </View>
  );
}
