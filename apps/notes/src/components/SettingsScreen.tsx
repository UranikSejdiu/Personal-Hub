import { useCallback, useRef, useState } from "react";
import { BackHandler, Linking, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight, Settings } from "./AppIcons";
import * as DocumentPicker from "expo-document-picker";
import { toast } from "sonner-native";
import { Text } from "./ui/Typography";
import { Button, IconButton } from "./ui/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateCard } from "./UpdateCard";
import { useTheme, useThemeColors } from "../lib/theme";
import { PreferenceChoices } from "./PreferenceChoices";
import { exportBackupToFile, importBackup, previewBackup, readBackupFile } from "../lib/backup";
import identity from "../appIdentity.json";

export default function SettingsScreen(_props: { activeAppId?: string }) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [pending, setPending] = useState<{ json: string; summary: string } | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => locked.current);
    return () => listener.remove();
  }, []));

  const run = async (action: () => Promise<unknown>, message?: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      if (result !== null && message) toast.success(message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally { locked.current = false; setBusy(false); }
  };
  const pick = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled) return null;
    const json = await readBackupFile(result.assets[0].uri);
    setPending({ json, summary: previewBackup(json) });
  });
  const confirmImport = () => run(async () => {
    if (!pending) return;
    const result = await importBackup(pending.json);
    setPending(null);
    setReceipt(pending.summary);
    if (result.preferences?.theme && result.preferencesRestored) setTheme(result.preferences.theme);
    toast.success(result.preferencesRestored ? "Import complete. Your original Hub data is unchanged." : "Records imported. Some appearance settings could not be restored.");
  });

  return <>
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <View className="w-full max-w-md self-center gap-4 px-5 pt-4">
        <View className="min-h-[48px] flex-row items-center gap-2">
          <IconButton icon={ArrowLeft} disabled={busy} accessibilityLabel="Notes"
            onPress={() => { if (!locked.current) { if (router.canGoBack()) router.back(); else router.replace("/(notes)"); } }} />
          <Text accessibilityRole="header" className="min-w-0 flex-1 text-2xl font-semibold text-foreground">Settings</Text>
        </View>
        <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Appearance</Text>
          <PreferenceChoices label="Appearance" value={theme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            disabled={busy} onChange={setTheme} />
        </View>
        <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Backup &amp; restore</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button className="min-w-[104px] flex-1" label="Export" disabled={busy} onPress={() => void run(exportBackupToFile, "Backup saved")} />
            <Button className="min-w-[104px] flex-1" label="Import" variant="secondary" disabled={busy} onPress={() => void pick()} />
          </View>
          {receipt && <Text accessibilityRole="alert" className="text-sm text-foreground">Imported records: {receipt}.</Text>}
          {actionError && !pending && <Text accessibilityRole="alert" className="text-sm text-destructive">{actionError}</Text>}
        </View>
        <Pressable disabled={busy} accessibilityState={{ disabled: busy }}
          className="min-h-[56px] flex-row items-center gap-3 rounded-[24px] border border-border bg-surface px-4 py-2 active:opacity-60"
          accessible accessibilityRole="button" accessibilityLabel="Manage app permissions" onPress={() => {
            if (locked.current) return;
            void Linking.openSettings().catch(() => toast.error("Could not open app settings. Open your phone's Settings and select My Notes."));
          }}>
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
            <Settings size={18} color={colors.foreground} />
          </View>
          <Text className="min-w-0 flex-1 text-[15px] font-medium text-foreground">Manage app permissions</Text>
          <ChevronRight size={18} color={colors.mutedForeground} />
        </Pressable>
        <UpdateCard />
        <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">About</Text>
          <Text className="text-body-medium text-foreground">Uranik Sejdiu</Text>
          <Button variant="secondary" label="GitHub · UranikSejdiu ↗" accessibilityRole="link" disabled={busy}
            onPress={() => { void Linking.openURL("https://github.com/UranikSejdiu").catch(() => toast.error("Could not open GitHub.")); }} />
        </View>
      </View>
    </ScrollView>
    <ConfirmDialog visible={pending !== null} title={`Import ${identity.title} data?`} message={`${pending?.summary ?? ""}\nThis replaces the current records in ${identity.title}.`} error={actionError} confirmLabel="Import" cancelLabel="Cancel" destructive onClose={() => { if (!locked.current) setPending(null); }} onConfirm={confirmImport} />
  </>;
}
