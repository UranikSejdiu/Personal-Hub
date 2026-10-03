import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n, type TKey } from "../../lib/i18n";
import { DashboardPreview } from "./DashboardPreview";
import { SavingsPreview } from "./SavingsPreview";
import { LoansPreview } from "./LoansPreview";

const SECTIONS = [
  { id: "dashboard", labelKey: "navDashboard", titleKey: "tutorialDashboard", descKey: "tutorialDashboardDesc", Preview: DashboardPreview },
  { id: "savings", labelKey: "navSavings", titleKey: "tutorialSavings", descKey: "tutorialSavingsDesc", Preview: SavingsPreview },
  { id: "loans", labelKey: "navLoans", titleKey: "tutorialLoans", descKey: "tutorialLoansDesc", Preview: LoansPreview },
] as const satisfies readonly { id: string; labelKey: TKey; titleKey: TKey; descKey: TKey; Preview: React.ComponentType }[];

export function BudgetTourPreview() {
  const { t } = useI18n();
  const [sectionId, setSectionId] = useState<(typeof SECTIONS)[number]["id"]>("dashboard");
  const section = SECTIONS.find((item) => item.id === sectionId) ?? SECTIONS[0];
  const Preview = section.Preview;

  return (
    <View className="gap-4">
      <View className="flex-row rounded-xl bg-muted/60 p-1">
        {SECTIONS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSectionId(item.id)}
            className={`min-h-[44px] flex-1 items-center justify-center rounded-lg px-1 active:opacity-70 ${item.id === sectionId ? "bg-card" : ""}`}
            accessible
            accessibilityRole="tab"
            accessibilityLabel={t(item.labelKey)}
            accessibilityState={{ selected: item.id === sectionId }}
          >
            <Text className={`text-center text-sm font-medium ${item.id === sectionId ? "text-foreground" : "text-muted-foreground"}`}>
              {t(item.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View className="gap-2">
        <Text className="text-base font-semibold text-foreground">{t(section.titleKey)}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">{t(section.descKey)}</Text>
      </View>
      <Preview />
    </View>
  );
}
