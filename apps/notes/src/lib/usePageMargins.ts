import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function usePageMargins() {
  const { width } = useWindowDimensions();
  const { left, right } = useSafeAreaInsets();
  const gutter = Math.max(12, (width - left - right - 408) / 2);
  return { marginLeft: left + gutter, marginRight: right + gutter };
}
