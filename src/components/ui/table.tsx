import { View, Text, ScrollView, type ViewProps, type TextProps } from "react-native";
import { cn } from "../../lib/utils";

interface TableProps extends ViewProps {
  scrollable?: boolean;
}

function Table({ className, scrollable, ...props }: TableProps) {
  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          className={cn("overflow-hidden rounded-md border border-border", className)}
          style={{ minWidth: 380 }}
          {...props}
        />
      </ScrollView>
    );
  }
  return (
    <View
      className={cn("overflow-hidden rounded-md border border-border", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex-row bg-muted px-2 py-2", className)} {...props} />
  );
}

interface TableBodyProps extends ViewProps {
  scrollable?: boolean;
}

function TableBody({ className, scrollable, ...props }: TableBodyProps) {
  if (scrollable) {
    return (
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        className={cn("", className)}
        {...(props as React.ComponentProps<typeof ScrollView>)}
      />
    );
  }
  return (
    <View
      className={cn("", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex-row items-center border-t border-border px-2 py-1.5", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn("text-xs font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: TextProps) {
  return (
    <Text className={cn("text-sm text-foreground", className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
