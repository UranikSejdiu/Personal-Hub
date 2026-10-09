import { Text } from "./ui/Typography";
import { useCallback, useEffect, useState, useRef } from "react";
import { View, Pressable, Platform } from "react-native";
import { Download, Loader2, RefreshCw, Rocket } from "./AppIcons";
import { toast } from "sonner-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useUpdate } from "../lib/UpdateContext";
import { downloadApk, installApk, openInstallSettings } from "../lib/updater";
import type { File } from "expo-file-system";

type UpdateState = "idle" | "downloading" | "ready";

export function UpdateCard() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const { hasUpdate, latest, currentVersion, checking, result, refresh } = useUpdate();
  const [state, setState] = useState<UpdateState>("idle");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [installFailed, setInstallFailed] = useState(false);
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
      toast.success(t("updateUpToDate"));
    } else if (result.status === "no-releases") {
      toast(t("updateNoReleases"));
    } else if (result.status === "error") {
      toast.error(t("updateCheckFailed"));
    }
  }, [refresh, t]);

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
      toast.success(t("updateInstallerOpened"));
    } catch {
      if (!mountedRef.current) return;
      if (!apk.exists) {
        pendingApkRef.current = null;
        setState("idle");
      }
      setInstallFailed(true);
      toast.error(t("updateInstallFailed"));
    } finally {
      installInFlightRef.current = false;
    }
  }, [latest, t]);

  const handleInstall = useCallback(async () => {
    if (!latest || installInFlightRef.current) return;
    installInFlightRef.current = true;
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
        toast.success(t("updateInstallerOpened"));
      } catch {
        if (!mountedRef.current) return;
        setInstallFailed(true);
        setState(apk.exists ? "ready" : "idle");
        if (!apk.exists) pendingApkRef.current = null;
        toast.error(t("updateInstallFailed"));
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg || t("updateCheckFailed"));
      setState("idle");
    } finally {
      installInFlightRef.current = false;
      if (mountedRef.current) setDownloadProgress(null);
    }
  }, [latest, t]);

  if (Platform.OS !== "android") return null;

  return (
    <View className="rounded-xl border border-border bg-card p-3 gap-3">
      <View className="flex-row items-center gap-2">
        <Rocket size={16} color={colors.primary} />
        <Text className="text-sm font-semibold text-foreground">{t("updatesTitle")}</Text>
      </View>

      {result?.status === "error" ? (
        <Text accessibilityRole="alert" className="text-xs text-muted-foreground">
          {t(result.cachedLatest ? "updateCachedWarning" : "updateCheckFailed")}
        </Text>
      ) : result?.status === "up-to-date" ? (
        <Text className="text-xs text-muted-foreground">{t("updateUpToDate")}</Text>
      ) : result?.status === "no-releases" ? (
        <Text className="text-xs text-muted-foreground">{t("updateNoReleases")}</Text>
      ) : null}
      {result?.checkedAt ? (
        <Text className="text-xs text-muted-foreground">
          {t("updateLastChecked", { time: new Date(result.checkedAt).toLocaleString() })}
        </Text>
      ) : null}

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">{t("currentVersion")}</Text>
          <View className="rounded-full bg-muted/60 px-2 py-0.5">
            <Text className="text-[11px] font-semibold text-foreground">v{currentVersion}</Text>
          </View>
        </View>
        {hasUpdate && latest ? (
          <View className="rounded-full bg-primary/15 px-2 py-0.5">
            <Text className="text-[11px] font-semibold text-primary">
              {t("updateAvailable")} v{latest.versionName}
            </Text>
          </View>
        ) : null}
      </View>

      {hasUpdate && latest ? (
        <View className="gap-3">
          <Text className="text-xs text-muted-foreground">
            {t("newVersionReady", { version: latest.versionName })}
          </Text>
          {latest.body ? (
            <View className="rounded-lg border border-border bg-muted/40 p-3">
              <Text className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("changelog")}
              </Text>
              <Text className="text-xs text-muted-foreground">{latest.body}</Text>
            </View>
          ) : null}

          {state === "downloading" && downloadProgress !== null ? (
            <View className="gap-1.5">
              <View className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${downloadProgress}%` }}
                />
              </View>
              <Text className="text-center text-[11px] text-muted-foreground">
                {t("downloadingUpdate", { percent: downloadProgress })}
              </Text>
            </View>
          ) : null}

          {state === "idle" && (
            <Pressable
              onPress={() => void handleInstall()}
              className="flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5"
              accessibilityRole="button"
              accessibilityLabel={t("downloadAndInstall")}
            >
              <Download size={14} color={colors.primaryForeground} />
              <Text className="text-sm font-medium text-primary-foreground">{t("downloadAndInstall")}</Text>
            </Pressable>
          )}

          {state === "ready" && (
            <Pressable
              onPress={() => void handleManualInstall()}
              className="flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5"
              accessibilityRole="button"
              accessibilityLabel={t("installNow")}
            >
              <Download size={14} color={colors.primaryForeground} />
              <Text className="text-sm font-medium text-primary-foreground">{t("installNow")}</Text>
            </Pressable>
          )}

          {installFailed && (
            <View className="gap-2">
              <Text className="text-center text-[11px] text-muted-foreground">
                {t("updateInstallSettingsHint")}
              </Text>
              <Pressable
                onPress={() => {
                  void openInstallSettings();
                }}
                className="flex-row items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5"
                accessibilityRole="button"
                accessibilityLabel={t("updateAllowInstalls")}
              >
                <Text className="text-sm font-medium text-foreground">{t("updateAllowInstalls")}</Text>
              </Pressable>
            </View>
          )}

          {installFailed && state === "ready" && (
            <Pressable
              onPress={() => void handleInstall()}
              className="flex-row items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5"
              accessibilityRole="button"
              accessibilityLabel={t("updateDownloadAgain")}
            >
              <Download size={14} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">{t("updateDownloadAgain")}</Text>
            </Pressable>
          )}

        </View>
      ) : null}
        <Pressable
          onPress={() => void handleCheck()}
          disabled={checking || state === "downloading"}
          className="flex-row items-center justify-center gap-2 rounded-lg border border-border bg-primary/10 p-3 disabled:opacity-50"
          accessibilityRole="button"
          accessibilityLabel={t("checkForUpdates")}
        >
          {checking ? (
            <Loader2 size={14} color={colors.primary} className="animate-spin" />
          ) : (
            <RefreshCw size={14} color={colors.primary} />
          )}
          <Text className="text-sm font-medium text-primary">
            {checking ? t("checkingForUpdates") : t("checkForUpdates")}
          </Text>
        </Pressable>
    </View>
  );
}
