import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { toast } from "sonner-native";
import { useThemeColors } from "../lib/theme";
import { Button } from "./ui/Button";
import { FormDialog } from "./ui/FormDialog";
import { Text, TextInput } from "./ui/Typography";

export function BackupPasswordDialog({ onSubmit, onClose }: {
  onSubmit: (password: string) => Promise<void>; onClose: () => void;
}) {
  const colors = useThemeColors();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const valid = password.length > 0;
  const submit = async () => {
    if (!valid || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await onSubmit(password); }
    catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Could not unlock backup. Try again.");
        toast.error("Could not unlock backup.");
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const inputClass = "min-h-[44px] rounded-[11px] border border-border/60 bg-card px-3 py-2.5 text-base text-foreground";
  return <FormDialog title="Unlock backup" busy={busy} onClose={() => { if (!inFlight.current) onClose(); }}>
    <Text className="text-sm text-muted-foreground">Enter the password used to save this backup.</Text>
    <TextInput accessibilityLabel="Backup password" placeholder="Password" placeholderTextColor={colors.mutedForeground}
      secureTextEntry autoComplete="off" textContentType="none" autoCorrect={false} autoCapitalize="none" maxLength={1024}
      editable={!busy} value={password} onChangeText={setPassword} className={inputClass} />
    {error && <Text accessibilityRole="alert" className="text-xs text-destructive">{error}</Text>}
    <View className="flex-row flex-wrap justify-end gap-2">
      <Button className="max-w-full" label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
      <Button className="max-w-full" label="Unlock" disabled={!valid} busy={busy} onPress={() => { void submit(); }} />
    </View>
  </FormDialog>;
}
