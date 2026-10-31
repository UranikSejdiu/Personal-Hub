import { useCallback, useRef, useState } from "react";
import { BackHandler, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { toast } from "sonner-native";
import { Text } from "./ui/Typography";
import { Button } from "./ui/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateCard } from "./UpdateCard";
import { useTheme } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { buildBackupEnvelope, exportBackup, exportBackupToDirectory, hasSafetyBackup, importBackup, previewBackup, readBackupFile, restoreSafetyBackup } from "../lib/backup";
import identity from "../appIdentity.json";

export default function SettingsScreen(_props: { activeAppId?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [safety, setSafety] = useState(false);
  const [pending, setPending] = useState<{ json: string; summary: string } | null>(null);
  const [recover, setRecover] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    setSafety(hasSafetyBackup());
  }, []));
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => locked.current);
    return () => listener.remove();
  }, []));

  const run = async (action: () => Promise<unknown>, message?: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const result = await action();
      if (result !== null && message) toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally { setSafety(hasSafetyBackup()); locked.current = false; setBusy(false); }
  };
  const pick = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json", "text/plain"], copyToCacheDirectory: true });
    if (result.canceled) return null;
    const json = await readBackupFile(result.assets[0].uri);
    setPending({ json, summary: previewBackup(json) });
  });
  const confirmImport = () => run(async () => {
    if (!pending) return;
    const result = await importBackup(pending.json);
    if (result.preferences?.theme && result.preferencesRestored) setTheme(result.preferences.theme);
    setReceipt(previewBackup(JSON.stringify(await buildBackupEnvelope())));
    setPending(null);
    toast.success(result.preferencesRestored ? "Import complete. Your original Hub data is unchanged." : "Records imported. Some appearance settings could not be restored.");
  });

  return <>
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pb-28">
      <View className="w-full max-w-md self-center gap-5 px-4 pt-3">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">{t("navSettings")}</Text>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Appearance</Text>
          <View className="flex-row flex-wrap gap-2">{(["light", "dark"] as const).map(value => <Button key={value} label={value === "light" ? "Light" : "Dark"} variant={theme === value ? "primary" : "secondary"} disabled={busy} onPress={() => setTheme(value)} />)}</View>
        </View>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Move from Personal Hub</Text>
          <Text className="text-sm text-muted-foreground">Keep Personal Hub installed. In Hub, export a full JSON backup using Save to folder. Import that same file here. Only {identity.title} data will be copied. Check your records, then save a new backup before uninstalling Hub. Transfers are snapshots; the apps do not sync afterward.</Text>
          <Button label="Import Hub or app backup" disabled={busy} onPress={() => void pick()} />
          {receipt && <Text accessibilityRole="alert" className="text-sm text-foreground">Verified stored records: {receipt}. Export a backup below to keep a separate copy.</Text>}
        </View>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Backup & restore</Text>
          <Text className="text-sm text-muted-foreground">Exports contain only this app’s records. Import replaces this app’s current records after saving a recovery copy. Save a backup before importing if you have already added new data here.</Text>
          <Button label="Save to folder" disabled={busy} onPress={() => void run(exportBackupToDirectory, "Backup saved to the selected folder.")} />
          <Button label="Share backup" variant="secondary" disabled={busy} onPress={() => void run(exportBackup, "Backup ready to share.")} />
          {safety && <Button label="Restore previous data" variant="secondary" disabled={busy} onPress={() => setRecover(true)} />}
        </View>
        <UpdateCard />
      </View>
    </ScrollView>
    <ConfirmDialog visible={pending !== null} title={`Import ${identity.title} data?`} message={`${pending?.summary ?? ""}\nThis replaces the current records in ${identity.title}. A recovery copy is saved first. Your Hub data is untouched.`} confirmLabel="Import" cancelLabel="Cancel" destructive onClose={() => { if (!locked.current) setPending(null); }} onConfirm={confirmImport} />
    <ConfirmDialog visible={recover} title="Restore previous data?" message="Replace current records with the copy saved before the last import. Export your current data first if you want to keep both." confirmLabel="Restore" cancelLabel="Cancel" destructive onClose={() => { if (!locked.current) setRecover(false); }} onConfirm={() => run(async () => {
      const result = await restoreSafetyBackup();
      if (result.preferencesRestored && result.preferences?.theme) setTheme(result.preferences.theme);
      setRecover(false); setReceipt(previewBackup(JSON.stringify(await buildBackupEnvelope())));
      toast.success(result.preferencesRestored ? "Previous data restored." : "Records restored. Some appearance settings could not be restored.");
    })} />
  </>;
}
