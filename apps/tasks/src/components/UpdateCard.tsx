import { Text } from "./ui/Typography";
import { View, Platform } from "react-native";
import { Download, RefreshCw } from "./AppIcons";
import { Button } from "./ui/Button";
import { toast } from "sonner-native";
import { useUpdate } from "../lib/UpdateContext";
import { openInstallSettings } from "../lib/updater";

export function UpdateCard() {
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
    } else if (result.status === "no-releases") {
      toast.info("No installable release is available yet");
    } else if (result.status === "error") {
      toast.error("Failed to check for updates");
    }
  };

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
            <Button label="Download update" icon={Download} disabled={checking || transferring} onPress={() => void downloadUpdate()} />
          )}

          {(transfer?.status === "ready" || transfer?.status === "installing") && (
            <Button label={transfer.status === "installing" ? "Opening installer…" : "Install update"}
              icon={Download} busy={transfer.status === "installing"} disabled={checking} onPress={() => void installUpdate()} />
          )}

          {installFailed && (
            <View className="gap-2">
              <Text className="text-center text-[11px] text-muted-foreground">
                If Android blocked the installer, check the install permission for this app.
              </Text>
              <Button label="Open install settings" variant="secondary" onPress={() => void openInstallSettings()} />
            </View>
          )}

          {installFailed && (
            <Button label="Download again" variant="secondary" icon={Download} disabled={checking || transferring} onPress={() => void downloadUpdate()} />
          )}

        </View>
      ) : null}
      <Button label={checking ? "Checking for updates…" : "Check for updates"} accessibilityLabel="Check for updates"
        variant="secondary" icon={RefreshCw} busy={checking} disabled={transferring} onPress={() => void handleCheck()} />
    </View>
  );
}
