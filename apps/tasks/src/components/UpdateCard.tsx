import { Text } from "./ui/Typography";
import { useCallback, useEffect, useState, useRef } from "react";
import { View, Platform } from "react-native";
import { Download, RefreshCw } from "./AppIcons";
import { Button } from "./ui/Button";
import { toast } from "sonner-native";
import { useUpdate } from "../lib/UpdateContext";
import { downloadApk, installApk, openInstallSettings } from "../lib/updater";
import type { File } from "expo-file-system";

type UpdateState = "idle" | "downloading" | "ready";

export function UpdateCard() {
  const { hasUpdate, latest, currentVersion, checking, result, refresh } = useUpdate();
  const [state, setState] = useState<UpdateState>("idle");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [installFailed, setInstallFailed] = useState(false);
  const [downloadError, setDownloadError] = useState<{ version: string; message: string } | null>(null);
  const pendingApkRef = useRef<File | null>(null);
  const pendingVersionRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const installInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pendingVersionRef.current && pendingVersionRef.current !== latest?.versionName && !installInFlightRef.current) {
      pendingApkRef.current = null;
      pendingVersionRef.current = null;
      setState("idle");
      setInstallFailed(false);
    }
  }, [latest?.versionName]);

  const handleCheck = useCallback(async () => {
    if (installInFlightRef.current) return;
    const result = await refresh();
    if (result.status === "up-to-date") {
      toast.success("You're up to date");
    } else if (result.status === "no-releases") {
      toast.info("No installable release is available yet");
    } else if (result.status === "error") {
      toast.error("Failed to check for updates");
    }
  }, [refresh]);

  const handleManualInstall = useCallback(async () => {
    const apk = pendingApkRef.current;
    if (!apk || installInFlightRef.current) return;
    if (!latest || pendingVersionRef.current !== latest.versionName) {
      pendingApkRef.current = null;
      setState("idle");
      return;
    }
    installInFlightRef.current = true;
    try {
      await installApk(apk);
      if (!mountedRef.current) return;
      setInstallFailed(false);
      toast.success("Update installer opened");
    } catch {
      if (!mountedRef.current) return;
      if (!apk.exists) {
        pendingApkRef.current = null;
        setState("idle");
      }
      setInstallFailed(true);
      toast.error("Could not open the update installer.");
    } finally {
      installInFlightRef.current = false;
    }
  }, [latest]);

  const handleInstall = useCallback(async () => {
    if (!latest || installInFlightRef.current) return;
    installInFlightRef.current = true;
    setDownloadError(null);
    setState("downloading");
    setDownloadProgress(null);
    setInstallFailed(false);
    pendingApkRef.current = null;
    try {
      const apk = await downloadApk(latest, {
        onProgress: (p) => { if (mountedRef.current) setDownloadProgress(p); },
      });
      if (!mountedRef.current) return;
      pendingApkRef.current = apk;
      pendingVersionRef.current = latest.versionName;
      try {
        await installApk(apk);
        if (!mountedRef.current) return;
        // Keep the APK around so the user can retry from the "ready" state if
        // they cancel the system installer dialog.
        setState("ready");
        toast.success("Update installer opened");
      } catch {
        if (!mountedRef.current) return;
        setInstallFailed(true);
        setState(apk.exists ? "ready" : "idle");
        if (!apk.exists) pendingApkRef.current = null;
        toast.error("Could not open the update installer.");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const msg = error instanceof Error ? error.message : String(error);
      setDownloadError({ version: latest.versionName, message: msg || "Download failed. Try again." });
      toast.error("Download failed. Try again.");
      setState("idle");
    } finally {
      installInFlightRef.current = false;
      if (mountedRef.current) setDownloadProgress(null);
    }
  }, [latest]);

  if (Platform.OS !== "android") return null;

  return (
    <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Updates</Text>
        <Text className="text-label-medium text-muted-foreground">v{currentVersion}</Text>
      </View>

      {result?.status === "error" ? (
        <Text accessibilityRole="alert" className="text-xs text-muted-foreground">
          {result.cachedLatest ? "Could not check now. Showing the update found during the last successful check." : "Failed to check for updates"}
        </Text>
      ) : result?.status === "up-to-date" ? (
        <Text className="text-xs text-muted-foreground">You&apos;re up to date</Text>
      ) : result?.status === "no-releases" ? (
        <Text className="text-xs text-muted-foreground">No installable release is available yet</Text>
      ) : null}
      {result?.checkedAt ? (
        <Text className="text-xs text-muted-foreground">
          {`Last successful check: ${new Date(result.checkedAt).toLocaleString("en")}`}
        </Text>
      ) : null}

      {hasUpdate && latest ? (
        <View className="gap-3">
          <Text className="text-body-medium font-semibold text-foreground">
            Update available · v{latest.versionName}
          </Text>
          {downloadError?.version === latest.versionName && (
            <Text accessibilityRole="alert" className="text-xs text-destructive">{downloadError.message}</Text>
          )}

          {state === "downloading" && downloadProgress !== null ? (
            <View className="gap-1.5">
              <View className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${downloadProgress}%` }}
                />
              </View>
              <Text className="text-center text-[11px] text-muted-foreground">
                {`Downloading... ${downloadProgress}%`}
              </Text>
            </View>
          ) : null}

          {state === "idle" && (
            <Button label="Download & Install" icon={Download} onPress={() => void handleInstall()} />
          )}

          {state === "ready" && (
            <Button label="Install now" icon={Download} onPress={() => void handleManualInstall()} />
          )}

          {installFailed && (
            <View className="gap-2">
              <Text className="text-center text-[11px] text-muted-foreground">
                If Android blocked the installer, check the install permission for this app.
              </Text>
              <Button label="Open install settings" variant="secondary" onPress={() => void openInstallSettings()} />
            </View>
          )}

          {installFailed && state === "ready" && (
            <Button label="Download again" variant="secondary" icon={Download} onPress={() => void handleInstall()} />
          )}

        </View>
      ) : null}
      <Button label={checking ? "Checking for updates…" : "Check for updates"} accessibilityLabel="Check for updates"
        variant="secondary" icon={RefreshCw} busy={checking} disabled={state === "downloading"} onPress={() => void handleCheck()} />
    </View>
  );
}
