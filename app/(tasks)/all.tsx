import { Redirect, useLocalSearchParams } from "expo-router";

/** Preserve links from earlier releases. */
export default function AllTasksScreen() {
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  return <Redirect href={{ pathname: "/(tasks)", params: taskId ? { taskId } : {} }} />;
}
