import { Image, View } from "react-native";
import { Text } from "./ui/Typography";
export function HubHeader() {
  return (
    <View className="min-h-[48px] min-w-[144px] flex-1 flex-row items-center gap-2">
      <Image source={require("../../assets/branding/icon.png")} className="h-6 w-6 shrink-0 rounded-md" accessible={false} />
      <Text accessibilityRole="header" className="min-w-0 flex-1 text-title-large font-medium text-foreground">MoneyPlan</Text>
    </View>
  );
}
