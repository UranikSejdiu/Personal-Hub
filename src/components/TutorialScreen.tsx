import { Text } from "./ui/Typography";
import { useState, useRef, useCallback, useEffect } from "react";
import { AppState, View, ScrollView, Pressable, useWindowDimensions, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useI18n, type TKey } from "../lib/i18n";
import { setTutorialSeen } from "../lib/tutorial";
import { toggleEnabledModule, useModulePreferences } from "../hub/ModulePreferences";
import { getHubRoute, HUB_APPS } from "../hub/registry";
import { useHaptics } from "../hooks/useHaptics";
import { toast } from "sonner-native";
import { Button } from "./ui/Button";
import { ModuleChooser } from "./ModuleChooser";
import { WelcomePreview } from "./tutorial/WelcomePreview";
import { NavigationPreview } from "./tutorial/NavigationPreview";
import { BudgetTourPreview } from "./tutorial/BudgetTourPreview";
import { NotesPreview } from "./tutorial/NotesPreview";
import { TasksPreview } from "./tutorial/TasksPreview";
import { SettingsPreview } from "./tutorial/SettingsPreview";
import Animated, { FadeInUp, ReduceMotion, useReducedMotion } from "react-native-reanimated";

interface TutorialPage {
  titleKey: TKey;
  descKey: TKey;
  preview?: React.ComponentType;
}

const PAGES: TutorialPage[] = [
  { titleKey: "tutorialWelcome", descKey: "tutorialWelcomeDesc", preview: WelcomePreview },
  { titleKey: "tutorialNavigation", descKey: "tutorialNavigationDesc", preview: NavigationPreview },
  { titleKey: "tutorialBudget", descKey: "tutorialBudgetDesc", preview: BudgetTourPreview },
  { titleKey: "tutorialNotes", descKey: "tutorialNotesDesc", preview: NotesPreview },
  { titleKey: "tutorialTasks", descKey: "tutorialTasksDesc", preview: TasksPreview },
  { titleKey: "tutorialSettings", descKey: "tutorialSettingsDesc", preview: SettingsPreview },
  { titleKey: "tutorialChooseModules", descKey: "tutorialChooseModulesDesc" },
];

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { t } = useI18n();
  const haptics = useHaptics();
  const { enabledIds, saveEnabledIds } = useModulePreferences();
  const [chosenIds, setChosenIds] = useState(enabledIds);
  const scrollRef = useRef<ScrollView>(null);
  const completingRef = useRef(false);
  const [completing, setCompleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);
  const currentPageRef = useRef(currentPage);
  const reduceMotion = useReducedMotion();
  const isLast = currentPage === PAGES.length - 1;

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Keep the current step aligned when the viewport changes size.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: currentPageRef.current * width, animated: false });
  }, [width]);

  const completeTutorial = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setCompleting(true);
    try {
      await saveEnabledIds(chosenIds);
      await setTutorialSeen(true);
      router.replace(getHubRoute(HUB_APPS.find((app) => chosenIds.includes(app.id))?.id ?? "budget") as Href);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      completingRef.current = false;
      setCompleting(false);
    }
  }, [chosenIds, router, saveEnabledIds, t]);

  const toggleModule = useCallback((id: string) => {
    setChosenIds((current) => toggleEnabledModule(current, id));
  }, []);

  const goToPage = useCallback((page: number) => {
    void haptics.light();
    scrollRef.current?.scrollTo({ x: page * width, animated: !reduceMotion });
    if (reduceMotion) setCurrentPage(page);
  }, [haptics, width, reduceMotion]);

  const handleNext = useCallback(() => {
    if (isLast) {
      void haptics.light();
      void completeTutorial();
    } else {
      goToPage(currentPage + 1);
    }
  }, [currentPage, isLast, haptics, completeTutorial, goToPage]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentPage(Math.max(0, Math.min(PAGES.length - 1, page)));
  }, [width]);

  return (
    <View className="flex-1 bg-background">
      <View className="min-h-[44px] flex-row items-center justify-between px-6" style={{ paddingTop: insets.top + 8 }}>
        <Text accessibilityLiveRegion="polite" className="text-xs font-medium text-muted-foreground">
          {t("tutorialStep", { current: currentPage + 1, total: PAGES.length })}
        </Text>
        {!isLast ? (
          <Pressable
            onPress={() => { void haptics.light(); goToPage(PAGES.length - 1); }}
            disabled={completing}
            accessible
            accessibilityRole="button"
            accessibilityLabel={t("tutorialSkip")}
            accessibilityState={{ disabled: completing }}
            className="min-h-[44px] items-center justify-center rounded-xl px-3 active:bg-muted"
          >
            <Text className="text-sm font-medium text-muted-foreground">{t("tutorialSkip")}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        horizontal
        pagingEnabled
        scrollEnabled={!completing}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
      >
        {PAGES.map((page, index) => {
          const Preview = page.preview;
          // Keep costly previews and repeating animations off inactive pages.
          const active = index === currentPage;
          return (
            <ScrollView
              key={page.titleKey}
              style={{ width }}
              contentContainerStyle={styles.pageContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? "auto" : "no-hide-descendants"}
            >
              <View className="w-full max-w-sm self-center gap-6">
                <View className="gap-3">
                  <Text accessibilityRole="header" className="text-3xl font-display text-foreground">{t(page.titleKey)}</Text>
                  <Text className="text-sm leading-6 text-muted-foreground">{t(page.descKey)}</Text>
                </View>
                {active ? (
                  <Animated.View entering={FadeInUp.duration(300).reduceMotion(ReduceMotion.System)} className="gap-3">
                    {Preview ? (
                      <>
                        {index > 1 && <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(page.titleKey === "tutorialSettings" ? "tutorialLiveThemePreview" : "tutorialSamplePreview")}</Text>}
                        {Preview === WelcomePreview ? <WelcomePreview active={foreground} />
                          : Preview === NavigationPreview ? <NavigationPreview active={foreground} /> : <Preview />}
                      </>
                    ) : <ModuleChooser enabledIds={chosenIds} onToggle={toggleModule} disabled={completing} />}
                  </Animated.View>
                ) : null}
              </View>
            </ScrollView>
          );
        })}
      </ScrollView>

      <View className="gap-4 border-t border-border/60 px-6 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="flex-row justify-center gap-2" accessible={false} importantForAccessibility="no-hide-descendants">
          {PAGES.map((_, index) => (
            <View key={index} className={`h-1.5 rounded-full ${index === currentPage ? "w-6 bg-primary" : "w-1.5 bg-border"}`} />
          ))}
        </View>
        <View className="flex-row justify-between gap-3">
          <Button label={t("tutorialBack")} variant="secondary" disabled={currentPage === 0 || completing} onPress={() => goToPage(currentPage - 1)} />
          <Button label={isLast ? t("tutorialGetStarted") : t("tutorialNext")} busy={completing} onPress={handleNext} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
});
