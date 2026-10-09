import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type Lang = "en";

const DEFAULT_LANG: Lang = "en";

const dict = { en: {
    dhikrArrangeTitle: "Arrange",
    myDhikrs: "My Dhikrs",
    saving: "Saving…",
    dhikrArrangeDone: "Done",
    dhikrArrangeHint: "Move with the arrows, then tap Done.",
    dhikrListTouchHint: "Tap a dhikr to start counting.",
    numberInputInvalid: "Invalid number. The last valid value is kept. Use 1,200.50 or 1.200,50 for grouped amounts.",
    navSettings: "Settings",
    navCounter: "Counter",
    navDhikrList: "Dhikrs",
    loading: "Loading…",
    retry: "Retry",
    dbInitFailed: "Failed to initialize database.",
    saveFailed: "Failed to save.",
    errorLoadingData: "Failed to load data.",
    errorSavingData: "Failed to save data.",
    errorReordering: "Failed to reorder.",
    errorDeletingDhikr: "Failed to delete dhikr.",
    errorResettingDhikr: "Failed to reset dhikr.",
    save: "Save",
    settingsTitle: "Settings",
    settingsBackupRestore: "Your counts",
    themeLight: "Light",
    themeDark: "Dark",
    themeLabel: "Theme",
    hapticsLabel: "Vibration feedback",
    exportData: "Back up counts",
    saveBackupToFolder: "Save backup to folder",
    shareBackup: "Share backup",
    backupSaved: "Backup saved to the selected folder",
    exportSuccess: "Data exported successfully",
    importData: "Import counts",
    importSuccess: "Data imported successfully",
    restoreSafetyBackup: "Restore previous data",
    version: "Version",
    checkForUpdates: "Check for updates",
    checkingForUpdates: "Checking for updates...",
    updatesTitle: "Updates",
    currentVersion: "Current version",
    updateAvailable: "Update available",
    updateAvailableToast: "New version {version} is available.",
    updateUpToDate: "You're up to date",
    updateCheckFailed: "Failed to check for updates",
    updateNoReleases: "No installable release is available yet",
    updateCachedWarning: "Could not check now. Showing the update found during the last successful check.",
    updateLastChecked: "Last successful check: {time}",
    changelog: "Changelog",
    newVersionReady: "New version {version} is ready to install.",
    downloadAndInstall: "Download & Install",
    installNow: "Install now",
    updateInstallerOpened: "Update installer opened",
    downloadingUpdate: "Downloading... {percent}%",
    updateInstallFailed: "Could not open the update installer.",
    updateInstallSettingsHint: "If Android blocked the installer, check the install permission for this app.",
    updateAllowInstalls: "Open install settings",
    updateDownloadAgain: "Download again",
    noDhikrsAdded: "No dhikrs added yet",
    tapToCount: "Tap to count",
    deleteConfirmTitle: "Delete",
    deleteConfirmBody: 'Delete "{name}"? All counts will be lost.',
    delete: "Delete",
    resetLabel: "Reset",
    limitReached: "Daily limit reached",
    confirm: "Confirm",
    total: "Total",
    editDhikr: "Edit Dhikr",
    dhikrActionsFor: "Actions for {name}",
    openDhikrNamed: "Open {name}",
    dhikrArrange: "Arrange",
    dhikrMoveUp: "Move {name} up",
    dhikrMoveDown: "Move {name} down",
    dhikrToday: "Today",
    dhikrDailyProgress: "Daily goal for {name}",
    newDhikr: "New Dhikr",
    nameLabel: "NAME",
    namePlaceholder: "e.g. SubhanAllah",
    limitLabel: "DAILY LIMIT (optional)",
    limitPlaceholder: "e.g. 100",
    totalCountLabel: "TOTAL COUNT",
    saveBtn: "Save",
    errorNoName: "Please enter a name",
    errorLimitPositive: "Limit must be a positive number",
    errorTotalCount: "Total count must be a whole number of 0 or more",
    goalComplete: "Daily Goal Complete!",
    noDhikrYet: "No dhikr yet",
    addFirstDhikr: "Add your first dhikr to begin counting",
    addDhikrBtn: "Add Dhikr",
    flaticonAttribution: "UIcons by Flaticon",
    linkOpenFailed: "Unable to open the link.",
    previousDhikr: "Previous",
    nextDhikr: "Next",
    cancel: "Cancel",
    exitTitle: "Exit app?",
    exitMessage: "Are you sure you want to leave the app?",
    exitApp: "Exit",
    appName: "Dhikr",
    backupHelp: "Save a copy of your dhikrs and counts, or restore them from a backup.",
    importDhikrConfirm: "Import {count} dhikrs? This replaces your current counts. A recovery copy of your current data will be saved first.",
    restoreConfirm: "Replace your current counts with the recovery copy from before your last import?",
    operationFailed: "Could not complete the operation: {reason}"
  } } as const;

export type TKey = keyof (typeof dict)["en"];

interface I18nContextValue {
  lang: Lang;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>): string => {
      let text: string = dict.en[key];
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    []
  );

  const value = useMemo(
    () => ({ lang: DEFAULT_LANG, t }),
    [t]
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider.");
  return ctx;
}
