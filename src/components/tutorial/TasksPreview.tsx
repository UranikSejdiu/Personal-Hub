import { Text, View } from "react-native";
import { TaskCard } from "../tasks/TaskCard";
import { sampleTask } from "../../lib/sampleDataset";
import { taskDateKey } from "../../lib/taskDates";
import { useI18n } from "../../lib/i18n";

/** The real task card, filled with a sample that never touches the database. */
export function TasksPreview() {
  const { t } = useI18n();
  const today = taskDateKey();
  const task = sampleTask(today, t("tutorialTaskSampleTitle"), t("tutorialTaskSampleNotes"));

  return <View className="w-full gap-3 px-1">
    <Text className="text-lg font-bold text-foreground">{t("tasksToday")}</Text>
    <Text className="text-sm text-muted-foreground">{t("tasksTodayHint")}</Text>
    <TaskCard task={task} today={today} busy onToggle={() => {}} onEdit={() => {}} onDelete={() => {}} />
    <Text className="text-sm text-muted-foreground">{t("tutorialTasksPreviewHint")}</Text>
  </View>;
}
