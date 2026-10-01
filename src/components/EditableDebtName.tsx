import { useRef, useState } from "react";
import { Pressable, Text, TextInput } from "react-native";
import { toast } from "sonner-native";
import { Pencil } from "./AppIcons";
import { useThemeColors } from "../lib/theme";
import { useI18n } from "../lib/i18n";

interface Props {
  name: string;
  fallback: string;
  label: string;
  onSave: (name: string) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean;
}

export function EditableDebtName({ name, fallback, label, onSave, onEditingChange, disabled = false }: Props) {
  const { t } = useI18n();
  const colors = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const committing = useRef(false);

  const commit = async () => {
    if (committing.current) return;
    const next = draft.trim();
    if (next === name) { setEditing(false); onEditingChange?.(false); return; }
    committing.current = true;
    try {
      await onSave(next);
      setEditing(false);
      onEditingChange?.(false);
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      committing.current = false;
    }
  };

  return editing ? (
    <TextInput
      autoFocus
      className="min-h-[44px] flex-1 rounded-lg border border-primary bg-background px-3 text-base font-semibold text-foreground"
      value={draft}
      onChangeText={setDraft}
      onBlur={() => { void commit(); }}
      onSubmitEditing={() => { void commit(); }}
      returnKeyType="done"
      maxLength={100}
      accessibilityLabel={label}
    />
  ) : (
    <Pressable
      className="min-h-[44px] flex-1 flex-row items-center justify-between gap-2 rounded-lg active:opacity-70"
      disabled={disabled}
      onPress={() => { setDraft(name); setEditing(true); onEditingChange?.(true); }}
      accessibilityRole="button"
      accessibilityLabel={t("editDebtName", { name: name || fallback })}
    >
      <Text className="shrink text-base font-semibold text-foreground" numberOfLines={1}>{name || fallback}</Text>
      <Pencil size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}
