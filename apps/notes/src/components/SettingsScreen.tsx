import { useCallback, useRef, useState } from "react";
import { BackHandler, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "./AppIcons";
import * as DocumentPicker from "expo-document-picker";
import { toast } from "sonner-native";
import { Text } from "./ui/Typography";
import { Button } from "./ui/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateCard } from "./UpdateCard";
import { useTheme, useThemeColors } from "../lib/theme";
import { getNotesPreferences, setNotesPreferences, type NotesPreferences } from "../lib/notesPreferences";
import { useI18n } from "../lib/i18n";
import { buildBackupEnvelope, exportBackup, exportBackupToDirectory, hasSafetyBackup, importBackup, previewBackup, readBackupFile, restoreSafetyBackup } from "../lib/backup";
import identity from "../appIdentity.json";

export default function SettingsScreen(_props: { activeAppId?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [notesPreferences, setNotesDisplay] = useState<NotesPreferences>({ viewMode: "grid", sort: "updated" });
  const [displayReady, setDisplayReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [safety, setSafety] = useState(false);
  const [pending, setPending] = useState<{ json: string; summary: string } | null>(null);
  const [recover, setRecover] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setDisplayReady(false);
    void getNotesPreferences().then(value => { if (active) { setNotesDisplay(value); setDisplayReady(true); } });
    setSafety(hasSafetyBackup());
    return () => { active = false; };
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
  const changeDisplay = (patch: Partial<NotesPreferences>) => run(async () => {
    const next = { ...notesPreferences, ...patch };
    await setNotesPreferences(next);
    setNotesDisplay(next);
  });
  const confirmImport = () => run(async () => {
    if (!pending) return;
    const result = await importBackup(pending.json);
    setNotesDisplay(await getNotesPreferences());
    if (result.preferences?.theme && result.preferencesRestored) setTheme(result.preferences.theme);
    setReceipt(previewBackup(JSON.stringify(await buildBackupEnvelope())));
    setPending(null);
    toast.success(result.preferencesRestored ? "Import complete. Your original Hub data is unchanged." : "Records imported. Some appearance settings could not be restored.");
  });

  return <>
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <View className="w-full max-w-md self-center gap-5 px-5 pt-4">
        <View className="flex-row items-center gap-4 pb-2">
          <Pressable disabled={busy} onPress={() => { if (!locked.current) { if (router.canGoBack()) router.back(); else router.replace("/(notes)"); } }}
            className="h-12 w-12 items-center justify-center rounded-full bg-card disabled:opacity-50"
            accessibilityRole="button" accessibilityLabel={t("navNotes")} accessibilityState={{ disabled: busy }}>
            <ArrowLeft size={22} color={colors.foreground} />
          </Pressable>
          <Text accessibilityRole="header" className="min-w-0 flex-1 text-[30px] font-semibold text-foreground">{t("navSettings")}</Text>
        </View>
        <View className="gap-4 rounded-[22px] bg-card p-5">
          <Text className="text-base font-semibold text-foreground">{t("notesAppearance")}</Text>
          <View className="flex-row flex-wrap gap-2">{(["light", "dark"] as const).map(value => <Button key={value} label={value === "light" ? "Light" : "Dark"} variant={theme === value ? "primary" : "secondary"} accessibilityState={{ selected: theme === value }} disabled={busy} onPress={() => setTheme(value)} />)}</View>
        </View>
        <View className="gap-4 rounded-[22px] bg-card p-5">
          <Text className="text-base font-semibold text-foreground">{t("notesLayout")}</Text>
          <View className="flex-row flex-wrap gap-2">{(["grid", "list"] as const).map(value => <Button key={value}
            label={t(value === "grid" ? "notesViewGrid" : "notesViewList")} variant={notesPreferences.viewMode === value ? "primary" : "secondary"}
            accessibilityState={{ selected: notesPreferences.viewMode === value }} disabled={busy || !displayReady}
            onPress={() => { void changeDisplay({ viewMode: value }); }} />)}</View>
          <Text className="text-sm font-semibold text-foreground">{t("notesSort")}</Text>
          <View className="flex-row flex-wrap gap-2">{([
            { value: "updated", label: "notesSortUpdated" }, { value: "created", label: "notesSortCreated" }, { value: "title", label: "notesSortTitle" },
          ] as const).map(option => <Button key={option.value} label={t(option.label)}
            variant={notesPreferences.sort === option.value ? "primary" : "secondary"} accessibilityState={{ selected: notesPreferences.sort === option.value }}
            disabled={busy || !displayReady} onPress={() => { void changeDisplay({ sort: option.value }); }} />)}</View>
        </View>
        <View className="gap-4 rounded-[22px] bg-card p-5">
          <Text className="text-base font-semibold text-foreground">Move from Personal Hub</Text>
          <Text className="text-sm text-muted-foreground">Keep Personal Hub installed. In Hub, export a full JSON backup using Save to folder. Import that same file here. Only {identity.title} data will be copied. Check your records, then save a new backup before uninstalling Hub. Transfers are snapshots; the apps do not sync afterward.</Text>
          <Button label="Import Hub or app backup" disabled={busy} onPress={() => void pick()} />
          {receipt && <Text accessibilityRole="alert" className="text-sm text-foreground">Verified stored records: {receipt}. Export a backup below to keep a separate copy.</Text>}
        </View>
        <View className="gap-4 rounded-[22px] bg-card p-5">
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
      setNotesDisplay(await getNotesPreferences());
      if (result.preferencesRestored && result.preferences?.theme) setTheme(result.preferences.theme);
      setRecover(false); setReceipt(previewBackup(JSON.stringify(await buildBackupEnvelope())));
      toast.success(result.preferencesRestored ? "Previous data restored." : "Records restored. Some appearance settings could not be restored.");
    })} />
  </>;
}
