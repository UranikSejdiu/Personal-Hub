import { Text } from "./ui/Typography";
import { View, Pressable, Platform } from "react-native";
import { Download, Loader2, RefreshCw } from "./AppIcons";
import { toast } from "sonner-native";
import { useThemeColors } from "../lib/theme";
import { useUpdate } from "../lib/UpdateContext";
import { openInstallSettings } from "../lib/updater";

export function UpdateCard() {
  const colors = useThemeColors();
  const {
    hasUpdate, latest, currentVersion, checking, result, refresh,
    transfer, transferring, downloadUpdate, installUpdate,
  } = useUpdate();
  const installFailed = transfer?.status === "ready" && transfer.installFailed;

  const handleCheck = async () => {
    if (checking || transferring) return;
    const result = await refresh();
    if (result.status === "up-to-date") {
      toast.success("You're up to date");
    } else if (result.status === "update") {
      toast.success(`New version ${result.latest.versionName} is available.`, { id: "update-available" });
    } else if (result.status === "no-releases") {
      toast.info("No installable release is available yet");
    } else if (result.status === "error") {
      toast.error("Failed to check for updates");
    }
  };

  if (Platform.OS !== "android") return null;

  return (
    <View className="gap-3 rounded-[24px] border border-border bg-surface p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-x-3">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">Updates</Text>
        <Text accessibilityLabel={`Current version ${currentVersion}`} className="text-label-medium text-muted-foreground">v{currentVersion}</Text>
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
        <View className="gap-2">
          <Text className="text-body-medium text-foreground">Update available v{latest.versionName}</Text>
          {transfer?.status === "failed" && (
            <Text accessibilityRole="alert" className="text-xs text-destructive">{transfer.message}</Text>
          )}

          {transfer?.status === "downloading" && (
            <View className="gap-1.5">
              {transfer.progress !== null && (
                <View className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <View className="h-full rounded-full bg-primary" style={{ width: `${transfer.progress}%` }} />
                </View>
              )}
              <Text className="text-center text-[11px] text-muted-foreground">
                {transfer.progress === null ? "Downloading…" : `Downloading… ${transfer.progress}%`}
              </Text>
            </View>
          )}

          {(!transfer || transfer.status === "failed") && (
            <Pressable
              onPress={() => void downloadUpdate()}
              disabled={checking || transferring}
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel="Download update"
            >
              <Download size={14} color={colors.primaryForeground} />
              <Text className="shrink text-center text-sm font-medium text-primary-foreground">Download update</Text>
            </Pressable>
          )}

          {(transfer?.status === "ready" || transfer?.status === "installing") && (
            <Pressable
              onPress={() => void installUpdate()}
              disabled={checking || transferring}
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full bg-primary px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel="Install update"
            >
              <Download size={14} color={colors.primaryForeground} />
              <Text className="shrink text-center text-sm font-medium text-primary-foreground">{transfer.status === "installing" ? "Opening installer…" : "Install update"}</Text>
            </Pressable>
          )}

          {installFailed && (
            <View className="gap-2">
              <Text className="text-center text-[11px] text-muted-foreground">
                If Android blocked the installer, check the install permission for this app.
              </Text>
              <Pressable
                onPress={() => {
                  void openInstallSettings();
                }}
                className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full border border-outline px-4 py-2"
                accessibilityRole="button"
                accessibilityLabel="Open install settings"
              >
                <Text className="shrink text-center text-sm font-medium text-foreground">Open install settings</Text>
              </Pressable>
            </View>
          )}

          {installFailed && (
            <Pressable
              onPress={() => void downloadUpdate()}
              disabled={checking || transferring}
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full border border-outline px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel="Download again"
            >
              <Download size={14} color={colors.foreground} />
              <Text className="shrink text-center text-sm font-medium text-foreground">Download again</Text>
            </Pressable>
          )}

        </View>
      ) : null}
        <Pressable
          onPress={() => void handleCheck()}
          disabled={checking || transferring}
          className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-full border border-outline px-4 py-2 disabled:opacity-50"
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
        >
          {checking ? (
            <Loader2 size={14} color={colors.primary} className="animate-spin" />
          ) : (
            <RefreshCw size={14} color={colors.primary} />
          )}
          <Text className="shrink text-center text-sm font-medium text-primary">
            {checking ? "Checking for updates..." : "Check for updates"}
          </Text>
        </Pressable>
    </View>
  );
}
