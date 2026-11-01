import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";
import { useThemeColors } from "../lib/theme";
import { Button } from "./ui/Button";
import { FormDialog } from "./ui/FormDialog";
import { Text, TextInput } from "./ui/Typography";

export function BackupPasswordDialog({ creating, onSubmit, onClose }: {
  creating: boolean; onSubmit: (password: string) => Promise<void>; onClose: () => void;
}) {
  const colors = useThemeColors();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const valid = creating ? password.length >= 12 && password === confirmation : password.length > 0;
  const submit = async () => {
    if (!valid || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await onSubmit(password); }
    catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Backup failed. Try again.");
        toast.error(creating ? "Could not save backup." : "Could not unlock backup.");
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const inputClass = "min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground";
  return <FormDialog title={creating ? "Protect backup" : "Unlock backup"} busy={busy} onClose={() => { if (!inFlight.current) onClose(); }}>
    <Text className="text-sm text-muted-foreground">{creating ? "Use 12+ characters. Keep this password—you’ll need it to restore." : "Enter the password used to save this backup."}</Text>
    <View className="gap-2">
      <TextInput accessibilityLabel="Backup password" placeholder="Password" placeholderTextColor={colors.mutedForeground}
        secureTextEntry autoComplete="off" textContentType="none" autoCorrect={false} autoCapitalize="none" maxLength={1024}
        editable={!busy} value={password} onChangeText={setPassword} className={inputClass} />
      {creating && <TextInput accessibilityLabel="Confirm backup password" placeholder="Confirm password" placeholderTextColor={colors.mutedForeground}
        secureTextEntry autoComplete="off" textContentType="none" autoCorrect={false} autoCapitalize="none" maxLength={1024}
        editable={!busy} value={confirmation} onChangeText={setConfirmation} className={inputClass} />}
    </View>
    {creating && confirmation.length > 0 && password !== confirmation && <Text accessibilityLiveRegion="polite" className="text-xs text-destructive">Passwords don’t match.</Text>}
    {error && <Text accessibilityRole="alert" className="text-xs text-destructive">{error}</Text>}
    <View className="flex-row justify-end gap-2">
      <Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
      <Button label={creating ? "Continue" : "Unlock"} disabled={!valid} busy={busy} onPress={() => { void submit(); }} />
    </View>
  </FormDialog>;
}
