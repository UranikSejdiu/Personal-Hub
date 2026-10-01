import { View } from "react-native";
import { SavingsGoalCard } from "../SavingsGoalCard";
import { SAMPLE_SAVINGS } from "../../lib/sampleDataset";

export function SavingsPreview() {
  // The first-run app records the configured monthly goal as an auto deposit.
  return (
    <View className="w-full">
      <SavingsGoalCard goalAmount={SAMPLE_SAVINGS.goal_amount} balance={SAMPLE_SAVINGS.goal_amount} />
    </View>
  );
}
