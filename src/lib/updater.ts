import { Platform } from "react-native";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface UpdateInfo {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  body: string;
}

export type CheckResult =
  | { status: "update"; currentVersion: string; latest: UpdateInfo }
  | { status: "up-to-date"; currentVersion: string }
  | { status: "no-releases"; currentVersion: string }
  | { status: "error"; currentVersion: string };

interface InstallResult {
  installed: boolean;
  needsPermission: boolean;
}

interface GitHubRelease {
  tag_name: string;
  body?: string;
  assets?: { name: string; browser_download_url: string }[];
}

const REPO = "UranikSejdiu/Personal-Hub";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = "update_check_cache";
const APK_FILENAME = "Personal-Hub-update.apk";

export async function getCurrentVersion(): Promise<string> {
  try {
    return Application.nativeApplicationVersion ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseLatestVersionCode(tag: string): number {
  const match = /v?(\d+)\.(\d+)\.(\d+)/.exec(tag);
  if (!match) return 0;
  return Number(match[1]) * 1000000 + Number(match[2]) * 1000 + Number(match[3]);
}

function isNewer(latestVersionCode: number, current: string): boolean {
  const currentMatch = /(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!currentMatch) return true;
  const currentVersionCode =
    Number(currentMatch[1]) * 1000000 +
    Number(currentMatch[2]) * 1000 +
    Number(currentMatch[3]);
  return latestVersionCode > currentVersionCode;
}

function findApkAsset(
  assets: { name: string; browser_download_url: string }[]
): { name: string; browser_download_url: string } | undefined {
  return assets.find((a) => /\.apk$/i.test(a.name));
}

function parseReleaseData(data: unknown): GitHubRelease | null {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (
    data &&
    typeof data === "object" &&
    "tag_name" in data &&
    typeof (data as GitHubRelease).tag_name === "string"
  ) {
    return data as GitHubRelease;
  }
  return null;
}

async function saveCheckCache(result: CheckResult): Promise<void> {
  if (result.status === "error") return;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // non-critical
  }
}

async function loadCheckCache(): Promise<CheckResult | null> {
  try {
    const value = await AsyncStorage.getItem(CACHE_KEY);
    if (!value) return null;
    return JSON.parse(value) as CheckResult;
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<CheckResult> {
  const currentVersion = await getCurrentVersion();
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (response.status === 403 || response.status === 429) {
      const cached = await loadCheckCache();
      if (cached && cached.status !== "error") {
        return cached;
      }
      return { status: "error", currentVersion };
    }

    if (response.status === 404) {
      return { status: "no-releases", currentVersion };
    }

    if (response.status !== 200) {
      return { status: "error", currentVersion };
    }

    const release = parseReleaseData(await response.text());
    if (!release) {
      return { status: "error", currentVersion };
    }

    const asset = findApkAsset(release.assets ?? []);
    if (!asset) {
      return { status: "error", currentVersion };
    }

    const latest: UpdateInfo = {
      versionName: release.tag_name.replace(/^v/i, ""),
      versionCode: parseLatestVersionCode(release.tag_name),
      downloadUrl: asset.browser_download_url,
      body: release.body ?? "",
    };

    const result: CheckResult = {
      status: isNewer(latest.versionCode, currentVersion) ? "update" : "up-to-date",
      currentVersion,
      latest,
    };

    await saveCheckCache(result);
    return result;
  } catch {
    const cached = await loadCheckCache();
    if (cached && cached.status !== "error") {
      return cached;
    }
    return { status: "error", currentVersion };
  }
}

export async function canInstall(): Promise<boolean> {
  return Platform.OS === "android";
}

export function openInstallSettings(): void {
  if (Platform.OS !== "android") return;
  const packageName = Application.applicationId;
  IntentLauncher.startActivityAsync(
    "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
    { data: `package:${packageName}` }
  );
}

export async function downloadAndInstall(info: UpdateInfo): Promise<InstallResult> {
  if (Platform.OS !== "android") {
    throw new Error("Auto-update is only supported on Android.");
  }

  const file = new File(Paths.cache, APK_FILENAME);
  const apk = await File.downloadFileAsync(
    info.downloadUrl,
    file,
    { idempotent: true }
  );

  await Sharing.shareAsync(apk.uri, {
    mimeType: "application/vnd.android.package-archive",
    dialogTitle: info.versionName,
  });

  return { installed: false, needsPermission: false };
}
