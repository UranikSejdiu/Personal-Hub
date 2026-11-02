import { View, type ViewProps } from "react-native";
import { Toaster } from "sonner-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FadeInUp, FadeOutUp, ReduceMotion } from "react-native-reanimated";
import { useTheme, useThemeColors } from "../lib/theme";
import { CircleCheck, XCircle, Info, CircleHelp } from "./AppIcons";

/** Same alert store and styling in the app and every native modal window. */
function AlertSurface({ toastId: _toastId, ...props }: ViewProps & { toastId: string | number }) {
  return <View {...props} accessibilityRole="alert" accessibilityLiveRegion="polite" />;
}

export function AppAlerts() {
  const { resolvedTheme } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
      <Toaster
        fullWindowOverlay={false}
        ToastWrapper={AlertSurface}
        position="top-center"
        offset={insets.top + 8}
        positionerStyle={{ maxWidth: 360, alignSelf: "center" }}
        theme={resolvedTheme}
        visibleToasts={1}
        duration={1000}
        closeButton={false}
        autoWiggleOnUpdate="never"
        swipeToDismissDirection="up"
        animation={{
          enter: FadeInUp.duration(180).reduceMotion(ReduceMotion.System),
          exit: FadeOutUp.duration(140).reduceMotion(ReduceMotion.System),
        }}
        icons={{
          success: <CircleCheck size={18} color={colors.background} />,
          error: <XCircle size={18} color={colors.background} />,
          info: <Info size={18} color={colors.background} />,
          warning: <CircleHelp size={18} color={colors.background} />,
        }}
        toastOptions={{
          style: {
            marginHorizontal: 16,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 48,
            borderRadius: 16,
            borderWidth: 0,
            backgroundColor: colors.foreground,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 3,
          },
          toastContentStyle: { gap: 10, alignItems: "center" },
          textContainerStyle: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10 },
          buttonsStyle: { marginTop: 0, gap: 8 },
          titleStyle: { color: colors.background, flexGrow: 1, flexShrink: 1, fontSize: 13, lineHeight: 20, fontFamily: "Urbanist-SemiBold", fontWeight: "normal" },
          descriptionStyle: { color: colors.background, opacity: 0.8, width: "100%", fontSize: 12, lineHeight: 18, fontFamily: "Urbanist-Regular", fontWeight: "normal" },
          actionButtonStyle: { minHeight: 44, borderRadius: 10, backgroundColor: colors.background, borderWidth: 0, paddingHorizontal: 12 },
          actionButtonTextStyle: { color: colors.foreground, fontFamily: "Urbanist-SemiBold", fontWeight: "normal" },
        }}
      />
  );
}
