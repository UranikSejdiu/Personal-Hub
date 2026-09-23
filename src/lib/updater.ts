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

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  body?: string | null;
  assets: GitHubAsset[];
}

const REPO = "UranikSejdiu/Personal-Hub";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = "update_check_cache";
const FETCH_TIMEOUT_MS = 15_000;
const GITHUB_ASSET_HOSTS = new Set([
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);

export async function getCurrentVersion(): Promise<string> {
  try {
    return Application.nativeApplicationVersion ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseVersion(tag: string): { name: string; code: number } | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!match) return null;
  const code = Number(match[1]) * 1_000_000 + Number(match[2]) * 1000 + Number(match[3]);
  return Number.isSafeInteger(code) ? { name: `${match[1]}.${match[2]}.${match[3]}`, code } : null;
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

function findApkAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
  return assets.find((asset) => asset.name === "app-release.apk");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGitHubAsset(value: unknown): value is GitHubAsset {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && typeof value.browser_download_url === "string";
}

function parseReleaseData(data: unknown): GitHubRelease | null {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(data) || typeof data.tag_name !== "string" || !Array.isArray(data.assets)) {
    return null;
  }
  const assets = data.assets.filter(isGitHubAsset);
  if (assets.length !== data.assets.length) return null;
  if (data.body !== undefined && data.body !== null && typeof data.body !== "string") return null;
  const body = typeof data.body === "string" ? data.body : data.body === null ? null : undefined;
  return {
    tag_name: data.tag_name,
    body,
    assets,
  };
}

function isExpectedAssetUrl(value: string, versionName: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname ===
        `/UranikSejdiu/Personal-Hub/releases/download/v${versionName}/app-release.apk`
    );
  } catch {
    return false;
  }
}

function isValidUpdateInfo(value: unknown): value is UpdateInfo {
  if (!isRecord(value)) return false;
  const versionName = typeof value.versionName === "string" ? value.versionName : "";
  const parsedVersion = parseVersion(`v${versionName}`);
  return (
    parsedVersion !== null &&
    typeof value.versionCode === "number" &&
    Number.isSafeInteger(value.versionCode) &&
    value.versionCode === parsedVersion.code &&
    typeof value.downloadUrl === "string" &&
    isExpectedAssetUrl(value.downloadUrl, versionName) &&
    typeof value.body === "string"
  );
}

function isCheckResult(value: unknown): value is CheckResult {
  if (!isRecord(value) || typeof value.currentVersion !== "string") return false;
  if (value.status === "error" || value.status === "no-releases" || value.status === "up-to-date") {
    return true;
  }
  return value.status === "update" && isValidUpdateInfo(value.latest);
}

async function resolveDownloadUrl(url: string, versionName: string): Promise<string> {
  if (!isExpectedAssetUrl(url, versionName)) throw new Error("Unexpected APK download URL");
  const response = await fetch(url, { method: "HEAD", redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("APK download redirect did not provide a URL");
    const redirected = new URL(location, url);
    if (redirected.protocol !== "https:" || !GITHUB_ASSET_HOSTS.has(redirected.hostname)) {
      throw new Error("APK download redirected to an unexpected host");
    }
    return redirected.toString();
  }
  if (!response.ok) throw new Error(`APK download URL check failed (${response.status})`);
  return url;
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
    const parsed: unknown = JSON.parse(value);
    return isCheckResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<CheckResult> {
  const currentVersion = await getCurrentVersion();
  const cachedOrError = async (): Promise<CheckResult> => {
    const cached = await loadCheckCache();
    return cached && cached.status !== "error" ? cached : { status: "error", currentVersion };
  };
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
      return cachedOrError();
    }

    if (response.status === 404) {
      return { status: "no-releases", currentVersion };
    }

    if (response.status !== 200) {
      return { status: "error", currentVersion };
    }

    const release = parseReleaseData(await response.text());
    if (!release) return cachedOrError();

    const version = parseVersion(release.tag_name);
    if (!version) return cachedOrError();

    const asset = findApkAsset(release.assets);
    if (!asset) return cachedOrError();
    if (!isExpectedAssetUrl(asset.browser_download_url, version.name)) {
      return cachedOrError();
    }

    const latest: UpdateInfo = {
      versionName: version.name,
      versionCode: version.code,
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
    return cachedOrError();
  }
}

export async function downloadApk(
  info: UpdateInfo,
  options?: InstallOptions
): Promise<File> {
  if (Platform.OS !== "android") throw new Error("Auto-update is only supported on Android.");
  if (!isValidUpdateInfo(info)) throw new Error("Invalid update metadata");

  const downloadUrl = await resolveDownloadUrl(info.downloadUrl, info.versionName);

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

  const task = File.createDownloadTask(downloadUrl, destination, {
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

  if (!apk || !apk.exists || apk.size <= 0) throw new Error("Download failed: empty APK file.");
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
