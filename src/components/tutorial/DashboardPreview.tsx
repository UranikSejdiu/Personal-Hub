import { useState } from "react";
import { View } from "react-native";
import { BudgetMonthCard } from "../BudgetMonthCard";
import { currentSampleMonth, sampleMonthSummary } from "../../lib/sampleDataset";

/**
 * Renders the real dashboard month card from the sample dataset, so the figures
 * shown are produced by the same aggregation the app uses. Tapping the chevron
 * really expands and collapses it.
 */
export function DashboardPreview() {
  const summary = sampleMonthSummary(currentSampleMonth());
  const [expanded, setExpanded] = useState(false);

  return (
    <View className="w-full px-1">
      <BudgetMonthCard
        summary={summary}
        variant="featured"
        expanded={expanded}
        onOpen={() => {}}
        onToggleExpand={() => setExpanded((prev) => !prev)}
        onDelete={() => {}}
      />
    </View>
  );
}
