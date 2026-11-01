import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type Lang = "en";

const DEFAULT_LANG: Lang = "en";

const dict = {
  en: {
    notesAll: "All notes",
    notesPinnedSection: "Pinned",
    notesArchivedList: "Archived notes",
    notesTextStatus: "Text note",
    notesArchiveAction: "Archive",
    notesRestoreAction: "Restore",
    notesChecklistStatus: "Checklist note",
    notesArchivedStatus: "Archived · read only",
    navSettings: "Settings",
    navNotes: "Notes",

    loading: "Loading…",
    retry: "Retry",
    dbInitFailed: "Failed to initialize database.",

    saveFailed: "Failed to save.",
    deleteFailed: "Failed to delete.",
    errorLoadingData: "Failed to load data.",



    save: "Save",
    saving: "Saving…",
    savedSuccess: "Saved successfully",
    back: "Back",


    delete: "Delete",
    confirm: "Confirm",



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

    notesTitle: "My Notes",
    notesFilterText: "Notes",
    notesFilterChecklist: "Checklists",
    notesLayout: "Notes layout",
    notesArchiveTitle: "Archive",
    notesArchive: "Save and archive note",
    notesUnarchive: "Restore note",
    notesRestoreHint: "Moves the note back to Notes so you can edit it.",
    notesArchivedReadOnly: "Archived notes are read-only. Restore this note to edit it.",
    notesRestoreFailed: "Could not restore the note. Please try again.",
    notesArchiveSaveHint: "Saves your current changes before moving the note.",
    notesArchived: "Note archived",
    notesUnarchived: "Note restored to Notes",
    notesArchiveFailed: "Could not save and move the note. Please try again.",
    notesArchiveEmpty: "No archived notes",
    notesArchiveEmptyHint: "Archive a note from its editor to keep it here.",
    notesArchiveSearchPlaceholder: "Search archived notes...",
    notesUntitled: "Untitled",
    notesTitlePlaceholder: "Title",
    notesSearchPlaceholder: "Search notes...",
    notesNew: "New Note",
    notesDelete: "Delete note",
    notesDeleteConfirm: "Delete this note?",
    notesPin: "Pin",
    notesUnpin: "Unpin",
    notesEmpty: "No notes yet",
    notesEmptyHint: "Tap + to create your first note",
    notesNoResults: "No notes found",
    notesPinned: "Pinned",
    notesContentPlaceholder: "Start writing…",
    notesContinueWriting: "Continue writing",
    notesUnsavedChanges: "You have unsaved changes. Leave anyway?",
    discardChangesTitle: "Discard changes?",
    discard: "Discard changes",
    notesBold: "Bold",
    notesDone: "Done",
    notesDoneHint: "Dismiss the keyboard and finish formatting. Use Save to save your note.",
    notesItalic: "Italic",
    notesStrikethrough: "Strikethrough",
    notesBulletList: "Bullet list",
    notesNumberedList: "Numbered list",
    notesChecklist: "Checklist",
    notesAddItem: "Add item",
    notesAddItemFailed: "Could not add item",
    notesNewText: "Text note",
    notesNewTextHint: "Write in rich text",
    notesNewChecklist: "Checklist",
    notesNewChecklistHint: "Track items with checkboxes",
    notesItemPlaceholder: "List item",
    notesItemDelete: "Delete item",
    notesCheckedItems: "{count} checked item",
    notesCheckedItemsPlural: "{count} checked items",
    notesChecklistProgress: "{completed} of {total} completed",
    notesMoreItems: "+{count} more",
    notesSort: "Sort",
    notesSortUpdated: "Date modified",
    notesSortCreated: "Date created",
    notesSortTitle: "Title",
    notesViewGrid: "Grid view",
    notesViewList: "List view",

    reorderHandle: "Drag to reorder",
    cancel: "Cancel",
    exitTitle: "Exit app?",
    exitMessage: "Are you sure you want to leave the app?",
    exitApp: "Exit",
    clear: "Clear",




  },
} as const;

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
