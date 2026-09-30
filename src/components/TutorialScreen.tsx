import { useState, useRef, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useI18n, type TKey } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { setTutorialSeen } from "../lib/tutorial";
import { useHaptics } from "../hooks/useHaptics";
import { withAlpha } from "../lib/utils";
import { toast } from "sonner-native";
import { WelcomePreview } from "./tutorial/WelcomePreview";
import { NavigationPreview } from "./tutorial/NavigationPreview";
import { DashboardPreview } from "./tutorial/DashboardPreview";
import { SavingsPreview } from "./tutorial/SavingsPreview";
import { LoansPreview } from "./tutorial/LoansPreview";
import { DhikrPreview } from "./tutorial/DhikrPreview";
import { NotesPreview } from "./tutorial/NotesPreview";
import { SettingsPreview } from "./tutorial/SettingsPreview";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface TutorialPage {
  titleKey: TKey;
  descKey: TKey;
  preview: React.ComponentType;
}

const PAGES: TutorialPage[] = [
  { titleKey: "tutorialWelcome", descKey: "tutorialWelcomeDesc", preview: WelcomePreview },
  { titleKey: "tutorialNavigation", descKey: "tutorialNavigationDesc", preview: NavigationPreview },
  { titleKey: "tutorialDashboard", descKey: "tutorialDashboardDesc", preview: DashboardPreview },
  { titleKey: "tutorialSavings", descKey: "tutorialSavingsDesc", preview: SavingsPreview },
  { titleKey: "tutorialLoans", descKey: "tutorialLoansDesc", preview: LoansPreview },
  { titleKey: "tutorialDhikr", descKey: "tutorialDhikrDesc", preview: DhikrPreview },
  { titleKey: "tutorialNotes", descKey: "tutorialNotesDesc", preview: NotesPreview },
  { titleKey: "tutorialSettings", descKey: "tutorialSettingsDesc", preview: SettingsPreview },
];

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const colors = useThemeColors();
  const haptics = useHaptics();
  const scrollRef = useRef<ScrollView>(null);
  const completingRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(0);

  const isLast = currentPage === PAGES.length - 1;

  const completeTutorial = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    try {
      await setTutorialSeen(true);
      router.replace("/(budget)" as Href);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      completingRef.current = false;
    }
  }, [router, t]);

  const handleNext = useCallback(() => {
    void haptics.light();
    if (isLast) {
      void completeTutorial();
    } else {
      const next = currentPage + 1;
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    }
  }, [currentPage, isLast, haptics, completeTutorial]);

  const handleSkip = useCallback(() => {
    void haptics.light();
    void completeTutorial();
  }, [haptics, completeTutorial]);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  }, []);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-end px-4 pt-2" style={{ paddingTop: insets.top + 8 }}>
        {!isLast ? (
          <Pressable onPress={handleSkip} accessibilityRole="button" accessibilityLabel={t("tutorialSkip")}>
            <Text className="text-sm font-medium text-muted-foreground">{t("tutorialSkip")}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
      >
        {PAGES.map((page, index) => {
          const Preview = page.preview;
          // Only mount the active and adjacent pages: the loans preview builds a
          // full amortisation schedule and several previews run infinite
          // animations, so rendering all eight up front wastes UI-thread time.
          const active = Math.abs(index - currentPage) <= 1;
          return (
            <View key={page.titleKey} style={{ width: SCREEN_WIDTH }} className="flex-1 items-center justify-center px-6">
              <View className="w-full max-w-sm items-center">
                {active ? <Preview /> : null}
                <View className="mt-8 items-center gap-2 px-4">
                  <Text className="text-center text-xl font-bold text-foreground">
                    {t(page.titleKey)}
                  </Text>
                  <Text className="text-center text-sm text-muted-foreground">
                    {t(page.descKey)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View className="flex-row items-center justify-between px-6 pb-8" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row gap-2">
          {PAGES.map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full ${
                i === currentPage ? "w-6 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </View>
        <Pressable
          onPress={handleNext}
          className="rounded-full bg-primary px-6 py-3"
          android_ripple={{ color: withAlpha(colors.primaryForeground, 0.188) }}
          accessibilityRole="button"
          accessibilityLabel={isLast ? t("tutorialGetStarted") : t("tutorialNext")}
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            {isLast ? t("tutorialGetStarted") : t("tutorialNext")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
