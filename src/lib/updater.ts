import { Platform } from "react-native";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
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

export interface InstallOptions {
  onProgress?: (percent: number) => void;
}

interface GitHubRelease {
  tag_name: string;
  body?: string;
  assets?: { name: string; browser_download_url: string }[];
}

const REPO = "UranikSejdiu/Personal-Hub";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = "update_check_cache";
const FETCH_TIMEOUT_MS = 15_000;

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
  return Number(match[1]) * 1_000_000 + Number(match[2]) * 1000 + Number(match[3]);
}

function isNewer(latestVersionCode: number, current: string): boolean {
  const currentMatch = /(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!currentMatch) return true;
  const currentVersionCode =
    Number(currentMatch[1]) * 1_000_000 +
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(RELEASES_URL, {
        headers: { Accept: "application/vnd.github.v3+json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 403 || response.status === 429) {
      const cached = await loadCheckCache();
      if (cached && cached.status !== "error") return cached;
      return { status: "error", currentVersion };
    }

    if (response.status === 404) {
      return { status: "no-releases", currentVersion };
    }

    if (response.status !== 200) {
      return { status: "error", currentVersion };
    }

    const release = parseReleaseData(await response.text());
    if (!release) return { status: "error", currentVersion };

    const asset = findApkAsset(release.assets ?? []);
    if (!asset) return { status: "error", currentVersion };

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
  } catch (error) {
    console.warn("[updater] checkForUpdate failed:", error);
    const cached = await loadCheckCache();
    if (cached && cached.status !== "error") return cached;
    return { status: "error", currentVersion };
  }
}

export async function downloadApk(
  info: UpdateInfo,
  options?: InstallOptions
): Promise<File> {
  if (Platform.OS !== "android") throw new Error("Auto-update is only supported on Android.");

  const destination = new File(Paths.cache, `Personal-Hub-${info.versionName}.apk`);
  try {
    if (destination.exists) await destination.delete();
  } catch {
    // ignore — idempotent download will handle leftover file
  }

  try {
    options?.onProgress?.(1);
  } catch {
    // non-critical
  }

  const task = File.createDownloadTask(info.downloadUrl, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (!options?.onProgress) return;
      if (totalBytes > 0) {
        options.onProgress(Math.min(100, Math.round((bytesWritten / totalBytes) * 100)));
      } else if (bytesWritten > 0) {
        options.onProgress(99);
      }
    },
  });

  let apk: File | null = null;
  try {
    apk = await task.downloadAsync();
  } catch (e) {
    throw new Error(e instanceof Error ? `Download failed: ${e.message}` : "Download failed");
  }

  if (!apk || !apk.exists) throw new Error("Download failed: no file written.");
  options?.onProgress?.(100);
  return apk;
}

export async function installApk(apk: File): Promise<void> {
  if (Platform.OS !== "android") throw new Error("Auto-update is only supported on Android.");
  if (!apk.exists) throw new Error("APK not found, please re-download");

  let contentUri: string;
  try {
    contentUri = await getContentUriAsync(apk.uri);
    if (!contentUri || !contentUri.startsWith("content://")) {
      throw new Error("FileProvider returned invalid uri");
    }
  } catch (e) {
    console.warn("[updater] getContentUriAsync failed:", e);
    throw new Error("Failed to get content URI for APK");
  }

  const flags = 0x10000000 | 0x00000001; // FLAG_ACTIVITY_NEW_TASK | FLAG_GRANT_READ_URI_PERMISSION
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      type: "application/vnd.android.package-archive",
      flags,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[updater] install intent failed:", msg, "uri:", contentUri);
    throw new Error(`Install intent failed: ${msg}`);
  }
}

export async function openInstallSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  const packageName = Application.applicationId;
  if (!packageName) return;
  try {
    await IntentLauncher.startActivityAsync(
      "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
      { data: `package:${packageName}` }
    );
  } catch (e) {
    console.warn("[updater] openInstallSettings failed:", e);
  }
}
