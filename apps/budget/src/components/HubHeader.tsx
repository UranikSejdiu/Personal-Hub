import { Image, View } from "react-native";
import { Text } from "./ui/Typography";
import { useThemeColors } from "../lib/theme";

export function HubHeader() {
  const colors = useThemeColors();
  return (
    <View className="min-h-[48px] min-w-[154px] flex-1 flex-row items-center gap-1">
      <Image source={require("../../assets/branding/logo-light.png")} className="h-8 w-8 shrink-0" tintColor={colors.foreground} accessible={false} />
      <Text accessibilityRole="header" className="min-w-0 flex-1 text-2xl font-semibold text-foreground">MoneyPlan</Text>
    </View>
  );
}
