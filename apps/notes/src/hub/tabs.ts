import { Archive, FileText, Settings } from "../components/AppIcons";
import type { NavigationDestination } from "../components/NavigationBar";

export const NOTES_TABS: readonly NavigationDestination[] = [
  { id: "index", label: "Notes", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings },
];
