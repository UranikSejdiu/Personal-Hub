import { useEffect } from "react";
import { BackHandler } from "react-native";

export function useBackButton(handler: () => boolean) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handler
    );
    return () => subscription.remove();
  }, [handler]);
}
