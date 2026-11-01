import { useCallback, useRef, useState } from "react";
import { BackHandler, Image, Linking, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useFocusEffect } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { toast } from "sonner-native";
import { Text } from "./ui/Typography";
import { Button } from "./ui/Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateCard } from "./UpdateCard";
import { BackupPasswordDialog } from "./BackupPasswordDialog";
import { decryptBackup, isEncryptedBackup } from "../lib/backupCrypto";
import { useTheme, useThemeColors } from "../lib/theme";
import { Check } from "./AppIcons";
import { useI18n } from "../lib/i18n";
import { buildBackupEnvelope, exportBackup, exportBackupToDirectory, hasSafetyBackup, importBackup, previewBackup, readBackupFile, restoreSafetyBackup } from "../lib/backup";
import identity from "../appIdentity.json";

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const colors = useThemeColors();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [safety, setSafety] = useState(false);
  const [pending, setPending] = useState<{ json: string; summary: string } | null>(null);
  const [recover, setRecover] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [passwordAction, setPasswordAction] = useState<"folder" | "share" | "unlock" | null>(null);
  const [encryptedFile, setEncryptedFile] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    setSafety(hasSafetyBackup());
  }, []));
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => locked.current);
    return () => listener.remove();
  }, []));

  const run = async (action: () => Promise<unknown>, message?: string, failureMessage = "Backup action failed. Try again.") => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setActionError(null);
    try {
      const result = await action();
      if (result !== null && message) toast.success(message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      toast.error(failureMessage);
    } finally { setSafety(hasSafetyBackup()); locked.current = false; setBusy(false); }
  };
  const pick = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/json", "text/plain"], copyToCacheDirectory: true });
    if (result.canceled) return null;
    const json = await readBackupFile(result.assets[0].uri);
    if (isEncryptedBackup(json)) {
      setEncryptedFile(json); setPasswordAction("unlock");
      return;
    }
    setPending({ json, summary: previewBackup(json) });
  });
  const submitPassword = async (password: string) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setActionError(null);
    try {
      if (passwordAction === "unlock") {
        if (!encryptedFile) throw new Error("No backup selected.");
        const json = await decryptBackup(encryptedFile, password);
        setPending({ json, summary: previewBackup(json) });
      } else {
        const result = passwordAction === "folder" ? await exportBackupToDirectory(password) : await exportBackup(password);
        if (result !== null) toast.success(passwordAction === "folder" ? "Backup saved" : "Backup ready");
      }
      setPasswordAction(null); setEncryptedFile(null);
    } finally { locked.current = false; setBusy(false); }
  };
  const confirmImport = () => run(async () => {
    if (!pending) return;
    const result = await importBackup(pending.json);
    if (result.preferences?.theme && result.preferencesRestored) setTheme(result.preferences.theme);
    setReceipt(previewBackup(JSON.stringify(await buildBackupEnvelope())));
    setPending(null);
    if (result.preferencesRestored) toast.success("Backup imported");
    else toast.warning("Data imported. Check appearance settings.");
  });

  return <>
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pb-28">
      <View className="w-full max-w-md self-center gap-5 px-4 pt-3">
        <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">{t("navSettings")}</Text>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Appearance</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" className="flex-row gap-1 rounded-[18px] bg-secondary p-1">
            {(["light", "dark"] as const).map(value => {
              const active = theme === value;
              const color = active ? colors.primaryForeground : colors.mutedForeground;
              return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === "light" ? "Light" : "Dark"}
                accessibilityState={{ checked: active, disabled: busy }} disabled={busy} onPress={() => setTheme(value)}
                className={`min-h-[52px] flex-1 flex-row items-center justify-center gap-2 rounded-[14px] px-3 py-3 active:opacity-70 ${active ? "bg-primary" : ""} ${busy ? "opacity-60" : ""}`}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
                  {value === "light" ? <><Circle cx={12} cy={12} r={4} /><Path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <Path d="M20.8 13a9 9 0 0 1-9.8-9.8A9 9 0 1 0 20.8 13Z" />}
                </Svg>
                <Text className={`text-sm font-semibold ${active ? "text-primary-foreground" : "text-muted-foreground"}`}>{value === "light" ? "Light" : "Dark"}</Text>
                <View className="w-3">{active && <Check size={12} color={color} />}</View>
              </Pressable>;
            })}
          </View>
        </View>
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Backup & restore</Text>
          <Text className="text-sm text-muted-foreground">Backups are password-protected. Import replaces current data after confirmation.</Text>
          <Button label="Save to folder" disabled={busy} onPress={() => setPasswordAction("folder")} />
          <Button label="Share backup" variant="secondary" disabled={busy} onPress={() => setPasswordAction("share")} />
          <Button label="Import backup" variant="secondary" disabled={busy} onPress={() => void pick()} />
          {receipt && <Text accessibilityRole="alert" className="text-sm text-foreground">Verified stored records: {receipt}.</Text>}
          {actionError && <Text accessibilityRole="alert" className="text-xs text-destructive">{actionError}</Text>}
          {safety && <Button label="Restore previous data" variant="secondary" disabled={busy} onPress={() => setRecover(true)} />}
        </View>
        <UpdateCard />
        <View className="gap-4 rounded-[22px] border border-border/60 bg-card p-5">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">About</Text>
          <View className="flex-row items-center gap-3">
            <Image source={require("../../assets/developer-avatar.png")} accessibilityLabel="Uranik Sejdiu" style={{ width: 58, height: 58, borderRadius: 29 }} />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-base font-semibold text-foreground">Uranik Sejdiu</Text>
              <Text className="text-xs text-muted-foreground">Creator of MoneyPlan</Text>
            </View>
          </View>
          <Text className="text-sm text-muted-foreground">Plan your month. Track payments. Save.</Text>
          <Button variant="secondary" label="GitHub · UranikSejdiu ↗" accessibilityRole="link" onPress={() => { void Linking.openURL("https://github.com/UranikSejdiu").catch(() => toast.error("Could not open GitHub.")); }} />
        </View>
      </View>
    </ScrollView>
    {passwordAction && <BackupPasswordDialog creating={passwordAction !== "unlock"} onSubmit={submitPassword}
      onClose={() => { if (!locked.current) { setPasswordAction(null); setEncryptedFile(null); } }} />}
    <ConfirmDialog visible={pending !== null} title={`Import ${identity.title} data?`} message={`${pending?.summary ?? ""}\nThis replaces the current records in ${identity.title}. A recovery copy is saved first. Your Hub data is untouched.`} confirmLabel="Import" cancelLabel="Cancel" destructive onClose={() => { if (!locked.current) setPending(null); }} onConfirm={confirmImport} />
    <ConfirmDialog visible={recover} title="Restore previous data?" message="Replace current records with the copy saved before the last import. Export your current data first if you want to keep both." confirmLabel="Restore" cancelLabel="Cancel" destructive onClose={() => { if (!locked.current) setRecover(false); }} onConfirm={() => run(async () => {
      const result = await restoreSafetyBackup();
      if (result.preferencesRestored && result.preferences?.theme) setTheme(result.preferences.theme);
      setRecover(false); setReceipt(previewBackup(JSON.stringify(await buildBackupEnvelope())));
      if (result.preferencesRestored) toast.success("Data restored");
      else toast.warning("Data restored. Check appearance settings.");
    })} />
  </>;
}
