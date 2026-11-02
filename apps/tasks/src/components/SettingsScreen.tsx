import { useCallback, useRef, useState } from "react";
import { BackHandler, Linking, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { toast } from "sonner-native";
import { Text } from "./ui/Typography";
import { Button } from "./ui/Button";
import { Check } from "./AppIcons";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateCard } from "./UpdateCard";
import { useTheme, useThemeColors } from "../lib/theme";
import { buildBackupEnvelope, exportBackup, exportBackupToDirectory, hasSafetyBackup, importBackup, previewBackup, readBackupFile, restoreSafetyBackup } from "../lib/backup";
import identity from "../appIdentity.json";
import { ReminderSetup } from "./tasks/ReminderSetup";

export default function SettingsScreen(_props: { activeAppId?: string }) {
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
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
        <View className="mb-1"><Text className="mb-1 text-xs text-muted-foreground">SETTINGS</Text><Text accessibilityRole="header" className="text-[28px] font-semibold tracking-[-0.8px] text-foreground">Make it yours.</Text></View>
        <ReminderSetup />
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Appearance</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" className="flex-row gap-1 rounded-[18px] bg-secondary p-1">
            {(["light", "dark"] as const).map(value => {
              const selected = theme === value;
              const color = selected ? colors.primaryForeground : colors.mutedForeground;
              return <Pressable key={value} disabled={busy} onPress={() => setTheme(value)}
                accessibilityRole="radio" accessibilityLabel={value === "light" ? "Light" : "Dark"}
                accessibilityState={{ checked: selected, disabled: busy }}
                className={`min-h-[52px] min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-[14px] px-3 py-3 active:opacity-70 ${selected ? "bg-primary" : ""} ${busy ? "opacity-60" : ""}`}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
                  {value === "light" ? <><Circle cx={12} cy={12} r={4} /><Path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <Path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" />}
                </Svg>
                <Text className={`shrink text-center text-sm font-semibold ${selected ? "text-primary-foreground" : "text-muted-foreground"}`}>{value === "light" ? "Light" : "Dark"}</Text>
                <View className="w-3">{selected && <Check size={12} color={color} />}</View>
              </Pressable>;
            })}
          </View>
        </View>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">App permissions</Text>
          <Text className="text-sm text-muted-foreground">Manage notification permissions and other device options in system settings.</Text>
          <Button label="Open app settings" variant="secondary" disabled={busy} onPress={() => {
            if (locked.current) return;
            void Linking.openSettings().catch(() => toast.error("Could not open app settings. Open system Settings and select Tasks."));
          }} />
        </View>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Backup & restore</Text>
          <Text className="text-sm text-muted-foreground">Import replaces current tasks and saves a recovery copy.</Text>
          <Button label="Save to folder" disabled={busy} onPress={() => void run(exportBackupToDirectory, "Backup saved to the selected folder.")} />
          <Button label="Share backup" variant="secondary" disabled={busy} onPress={() => void run(exportBackup, "Backup ready to share.")} />
          <Button label="Import backup" variant="secondary" disabled={busy} onPress={() => void pick()} />
          {receipt && <Text accessibilityRole="alert" className="text-sm text-foreground">Verified stored records: {receipt}. Export a backup above to keep a separate copy.</Text>}
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
