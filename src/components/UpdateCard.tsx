import { useCallback, useState, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { Download, Loader2, RefreshCw, Rocket } from "lucide-react-native";
import { toast } from "sonner-native";
import { useI18n } from "../lib/i18n";
import { useThemeColors } from "../lib/theme";
import { useUpdate } from "../lib/UpdateContext";
import { downloadApk, installApk, openInstallSettings } from "../lib/updater";
import type { File } from "expo-file-system";
import { AppState } from "react-native";

type UpdateState = "idle" | "downloading" | "ready";

export function UpdateCard() {
  const { t } = useI18n();
  const colors = useThemeColors();
  const { hasUpdate, latest, currentVersion, checking, refresh } = useUpdate();
  const [state, setState] = useState<UpdateState>("idle");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [needPermission, setNeedPermission] = useState(false);
  const pendingApkRef = useRef<File | null>(null);

  const handleCheck = useCallback(async () => {
    const result = await refresh();
    if (result.status === "up-to-date") {
      toast.success(t("updateUpToDate"));
    } else if (result.status === "no-releases") {
      toast(t("updateNoReleases"));
    } else if (result.status === "error") {
      toast.error(t("updateCheckFailed"));
    }
  }, [refresh, t]);

  const handleInstall = useCallback(async () => {
    if (!latest) return;
    setState("downloading");
    setDownloadProgress(null);
    setNeedPermission(false);
    try {
      const apk = await downloadApk(latest, {
        onProgress: (p) => setDownloadProgress(p),
      });
      pendingApkRef.current = apk;
      try {
        await installApk(apk);
        setState("ready");
        pendingApkRef.current = null;
        toast.success(t("updateInstallerOpened"));
      } catch {
        setNeedPermission(true);
        setState("idle");
        toast(t("updatePermissionNeeded"));
        openInstallSettings();

        const sub = AppState.addEventListener("change", (next) => {
          if (next === "active" && pendingApkRef.current) {
            const pending = pendingApkRef.current;
            void (async () => {
              try {
                await installApk(pending);
                pendingApkRef.current = null;
                setNeedPermission(false);
                toast.success(t("updateInstallerOpened"));
              } catch {
                // still no permission — user can tap manual button
              }
            })();
          }
          if (next !== "active") return;
          sub.remove();
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg || t("updateCheckFailed"));
      setState("idle");
    } finally {
      setDownloadProgress(null);
    }
  }, [latest, t]);

  const handleManualInstall = useCallback(async () => {
    const apk = pendingApkRef.current;
    if (!apk) return;
    try {
      await installApk(apk);
      pendingApkRef.current = null;
      setNeedPermission(false);
      toast.success(t("updateInstallerOpened"));
    } catch {
      toast(t("updatePermissionNeeded"));
      openInstallSettings();
    }
  }, [t]);

  return (
    <View className="rounded-xl border border-border bg-card p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Rocket size={16} color={colors.primary} />
        <Text className="text-sm font-semibold text-foreground">{t("updatesTitle")}</Text>
      </View>

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
              <Download size={14} color="#fff" />
              <Text className="text-sm font-medium text-white">{t("downloadAndInstall")}</Text>
            </Pressable>
          )}

          {needPermission && (
            <View className="gap-2">
              <Text className="text-center text-[11px] text-muted-foreground">
                {t("updatePermissionNeeded")}
              </Text>
              <Pressable
                onPress={() => {
                  void openInstallSettings();
                  setNeedPermission(false);
                }}
                className="flex-row items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5"
                accessibilityRole="button"
                accessibilityLabel={t("updateAllowInstalls")}
              >
                <Text className="text-sm font-medium text-foreground">{t("updateAllowInstalls")}</Text>
              </Pressable>
            </View>
          )}

          {needPermission && (
            <Pressable
              onPress={() => void handleManualInstall()}
              className="flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5"
              accessibilityRole="button"
              accessibilityLabel={t("installNow")}
            >
              <Download size={14} color="#fff" />
              <Text className="text-sm font-medium text-white">{t("installNow")}</Text>
            </Pressable>
          )}

          {needPermission && (
            <Text className="text-center text-[11px] text-muted-foreground">
              {t("playProtectHint")}
            </Text>
          )}
        </View>
      ) : (
        <Pressable
          onPress={() => void handleCheck()}
          disabled={checking}
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
      )}
    </View>
  );
}
