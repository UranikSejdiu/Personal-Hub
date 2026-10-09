import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      {...props}
      className={cn("rounded-2xl border border-border/60 bg-card p-3", className)}
    />
  );
}
