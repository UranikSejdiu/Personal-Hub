import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      {...props}
      className={cn("rounded-[24px] border border-border bg-surface p-4", className)}
    />
  );
}
