import { FileText, ListOrdered } from "./AppIcons";
import { ActionDialog } from "./ui/ActionDialog";
import { useHaptics } from "../hooks/useHaptics";
import { useI18n, type TKey } from "../lib/i18n";
import type { NoteKind } from "../types/notes";

interface NoteTypeChooserProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: NoteKind) => void;
}

const OPTIONS: {
  kind: NoteKind;
  labelKey: TKey;
  hintKey: TKey;
}[] = [
  { kind: "text", labelKey: "notesNewText", hintKey: "notesNewTextHint" },
  { kind: "checklist", labelKey: "notesNewChecklist", hintKey: "notesNewChecklistHint" },
];

export function NoteTypeChooser({ visible, onClose, onSelect }: NoteTypeChooserProps) {
  const haptics = useHaptics();
  const { t } = useI18n();

  return <ActionDialog visible={visible} title={t("notesNew")} onClose={onClose} actions={OPTIONS.map(option => ({
    key: option.kind, label: t(option.labelKey), icon: option.kind === "text" ? FileText : ListOrdered, primary: option.kind === "text",
    onPress: () => { void haptics.light(); onSelect(option.kind); },
  }))} />;
}
