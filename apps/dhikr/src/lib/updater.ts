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
  | { status: "update"; currentVersion: string; latest: UpdateInfo; checkedAt: number }
  | { status: "up-to-date"; currentVersion: string; checkedAt: number }
  | { status: "no-releases"; currentVersion: string; checkedAt: number }
  | { status: "error"; currentVersion: string; cachedLatest?: UpdateInfo; checkedAt?: number };

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
  draft: boolean;
  prerelease: boolean;
}

const REPO = "UranikSejdiu/Personal-Hub";
const APP_ID = "com.dhiker.counter";
const TAG_PREFIX = "dhikr-v";
const APK_PREFIX = "Dhikr";
const assetName = (version: string) => `Dhikr-${version}.apk`;
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;
const CACHE_KEY = `update_check_cache_v2_${APP_ID}`;
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RELEASES_PER_PAGE = 100;
const MAX_RELEASE_PAGES = 10;
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
  if (!tag.startsWith(TAG_PREFIX)) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag.slice(TAG_PREFIX.length));
  if (!match) return null;
  const code = Number(match[1]) * 1_000_000 + Number(match[2]) * 1000 + Number(match[3]);
  return Number.isSafeInteger(code) ? { name: `${match[1]}.${match[2]}.${match[3]}`, code } : null;
}

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function findApkAsset(assets: GitHubAsset[], version: string): GitHubAsset | undefined {
  return assets.find((asset) => asset.name === assetName(version));
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
  if (typeof data.draft !== "boolean" || typeof data.prerelease !== "boolean") return null;
  const body = typeof data.body === "string" ? data.body : data.body === null ? null : undefined;
  return {
    tag_name: data.tag_name,
    body,
    assets,
    draft: data.draft,
    prerelease: data.prerelease,
  };
}

function isExpectedAssetUrl(value: string, versionName: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.pathname ===
        `/${REPO}/releases/download/${TAG_PREFIX}${versionName}/${assetName(versionName)}`
    );
  } catch {
    return false;
  }
}

function isValidUpdateInfo(value: unknown): value is UpdateInfo {
  if (!isRecord(value)) return false;
  const versionName = typeof value.versionName === "string" ? value.versionName : "";
  const parsedVersion = parseVersion(`${TAG_PREFIX}${versionName}`);
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

function isCheckResult(value: unknown): value is Exclude<CheckResult, { status: "error" }> {
  if (!isRecord(value) || typeof value.currentVersion !== "string") return false;
  if (typeof value.checkedAt !== "number" || !Number.isFinite(value.checkedAt) || value.checkedAt <= 0) return false;
  if (value.status === "no-releases" || value.status === "up-to-date") {
    return true;
  }
  return value.status === "update" && isValidUpdateInfo(value.latest);
}

async function resolveDownloadUrl(url: string, versionName: string): Promise<string> {
  if (!isExpectedAssetUrl(url, versionName)) throw new Error("Unexpected APK download URL");

  // React Native does not support `redirect: "manual"`, so follow redirects and
  // validate the final URL that fetch reports instead. A failed probe falls back
  // to the already-validated github.com URL, which is safe to fetch directly.
  let finalUrl = url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (response.status !== 0 && !response.ok) {
      throw new Error(`APK download URL check failed (${response.status})`);
    }
    if (response.url) finalUrl = response.url;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("APK download URL check failed")) {
      throw error;
    }
    return url;
  } finally {
    clearTimeout(timeout);
  }

  const resolved = new URL(finalUrl, url);
  const hostAllowed =
    resolved.hostname === "github.com" || GITHUB_ASSET_HOSTS.has(resolved.hostname);
  if (resolved.protocol !== "https:" || !hostAllowed) {
    throw new Error("APK download redirected to an unexpected host");
  }
  return finalUrl;
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

export async function cleanupInstalledApks(): Promise<void> {
  if (Platform.OS !== "android") return;
  const installed = parseVersion(`${TAG_PREFIX}${Application.nativeApplicationVersion ?? ""}`);
  if (!installed || !Paths.cache.exists) return;

  // Only remove this updater's installers for versions already installed.
  // A newer APK may still be needed by the system installer or for a retry.
  for (const entry of Paths.cache.list()) {
    if (!(entry instanceof File)) continue;
    if (!entry.name.startsWith(`${APK_PREFIX}-`)) continue;
    const match = /^(\d+\.\d+\.\d+)\.apk$/.exec(entry.name.slice(APK_PREFIX.length + 1));
    if (!match) continue;
    const version = parseVersion(`${TAG_PREFIX}${match[1]}`);
    if (version && compareVersions(version.name, installed.name) <= 0 && entry.exists) entry.delete();
  }
}

let checkInProgress: Promise<CheckResult> | null = null;

export async function checkForUpdate(): Promise<CheckResult> {
  if (checkInProgress) return checkInProgress;
  const pending = performUpdateCheck();
  checkInProgress = pending;
  try { return await pending; } finally { checkInProgress = null; }
}

async function performUpdateCheck(): Promise<CheckResult> {
  // Run before the network check so cleanup also works offline after an update.
  try {
    await cleanupInstalledApks();
  } catch (error) {
    // Cache maintenance must not prevent update checks; retry on the next check.
    console.warn("[updater] installed APK cleanup failed:", error);
  }
  const currentVersion = await getCurrentVersion();
  const cachedOrError = async (): Promise<CheckResult> => {
    const cached = await loadCheckCache();
    const age = cached?.checkedAt === undefined ? Infinity : Date.now() - cached.checkedAt;
    // A previous check cannot prove the app is up to date now. Preserve only
    // a recent known newer installer, with an explicit failed-check status.
    if (cached?.status === "update" && cached.currentVersion === currentVersion &&
        age >= 0 && age <= CACHE_MAX_AGE_MS && compareVersions(cached.latest.versionName, currentVersion) > 0) {
      return { status: "error", currentVersion, cachedLatest: cached.latest, checkedAt: cached.checkedAt };
    }
    return { status: "error", currentVersion };
  };
  const controller = new AbortController();
  // Cover response bodies and all pages, not only the first response headers.
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    if (!parseVersion(`${TAG_PREFIX}${currentVersion}`)) throw new Error("Installed version is unavailable");
    let latest: UpdateInfo | null = null;
    for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
      const response = await fetch(`${RELEASES_URL}?per_page=${RELEASES_PER_PAGE}&page=${page}`, {
        headers: { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      if (response.status !== 200) throw new Error(`Release check failed (${response.status})`);
      const data: unknown = JSON.parse(await response.text());
      if (!Array.isArray(data)) throw new Error("Invalid releases response");
      for (const row of data) {
        if (!isRecord(row) || typeof row.tag_name !== "string") throw new Error("Invalid release");
        const version = parseVersion(row.tag_name);
        if (!version || row.draft === true || row.prerelease === true) continue;
        const release = parseReleaseData(row);
        if (!release) throw new Error("Invalid app release");
        const asset = findApkAsset(release.assets, version.name);
        // A release may be published before CI finishes attaching its APK.
        if (!asset) continue;
        if (!isExpectedAssetUrl(asset.browser_download_url, version.name)) throw new Error("Unexpected APK download URL");
        if (!latest || compareVersions(version.name, latest.versionName) > 0) {
          latest = { versionName: version.name, versionCode: version.code,
            downloadUrl: asset.browser_download_url, body: release.body ?? "" };
        }
      }
      if (data.length < RELEASES_PER_PAGE) break;
      if (page === MAX_RELEASE_PAGES) throw new Error("Release history is incomplete");
    }
    const checkedAt = Date.now();
    const result: CheckResult = !latest
      ? { status: "no-releases", currentVersion, checkedAt }
      : compareVersions(latest.versionName, currentVersion) > 0
        ? { status: "update", currentVersion, latest, checkedAt }
        : { status: "up-to-date", currentVersion, checkedAt };

    await saveCheckCache(result);
    return result;
  } catch (error) {
    console.warn("[updater] checkForUpdate failed:", error);
    return cachedOrError();
  } finally {
    clearTimeout(timeout);
  }
}

let downloadInProgress = false;

export async function downloadApk(
  info: UpdateInfo,
  options?: InstallOptions
): Promise<File> {
  if (downloadInProgress) throw new Error("An update download is already in progress.");
  downloadInProgress = true;
  try {
    return await performApkDownload(info, options);
  } finally {
    downloadInProgress = false;
  }
}

async function performApkDownload(
  info: UpdateInfo,
  options?: InstallOptions
): Promise<File> {
  if (Platform.OS !== "android") throw new Error("Auto-update is only supported on Android.");
  if (Application.applicationId && Application.applicationId !== APP_ID) throw new Error("This installer belongs to a different app.");
  if (!isValidUpdateInfo(info)) throw new Error("Invalid update metadata");

  const downloadUrl = await resolveDownloadUrl(info.downloadUrl, info.versionName);

  const destination = new File(Paths.cache, `${APK_PREFIX}-${info.versionName}.apk`);
  if (destination.exists) destination.delete();

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

  try {
    const apk = await task.downloadAsync();
    if (!apk || !apk.exists || apk.size <= 0) throw new Error("Empty APK file.");
    options?.onProgress?.(100);
    return apk;
  } catch (e) {
    // Android streams directly to the destination, including on failed downloads.
    try {
      if (destination.exists) destination.delete();
    } catch (cleanupError) {
      console.warn("[updater] incomplete APK cleanup failed:", cleanupError);
    }
    throw new Error(e instanceof Error ? `Download failed: ${e.message}` : "Download failed");
  }
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
