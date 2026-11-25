import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { File } from "expo-file-system";
import { toast } from "sonner-native";
import { AppState, Platform } from "react-native";
import * as updater from "./updater";
import type { UpdateInfo, CheckResult } from "./updater";

type UpdateTransfer =
  | { version: string; status: "downloading"; progress: number | null }
  | { version: string; status: "ready"; apk: File; installFailed?: boolean }
  | { version: string; status: "installing" }
  | { version: string; status: "failed"; message: string };

interface UpdateContextValue {
  hasUpdate: boolean;
  latest: UpdateInfo | null;
  currentVersion: string;
  checking: boolean;
  result: CheckResult | null;
  refresh: () => Promise<CheckResult>;
  transfer: UpdateTransfer | null;
  transferring: boolean;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const latest = result?.status === "update" ? result.latest : result?.status === "error" ? result.cachedLatest ?? null : null;
  const hasUpdate = latest !== null;
  const [currentVersion, setCurrentVersion] = useState("0.0.0");
  const [checking, setChecking] = useState(false);
  const [transfer, setTransfer] = useState<UpdateTransfer | null>(null);
  const transferInFlight = useRef(false);
  const transferring = transfer?.status === "downloading" || transfer?.status === "installing";
  const currentTransfer = transfer && transfer.version === latest?.versionName ? transfer : null;
  const startupCheckStartedRef = useRef(false);
  const notifiedVersionRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<CheckResult> | null>(null);


  const runCheck = useCallback(async (): Promise<CheckResult> => {
    if (inflightRef.current) return inflightRef.current;
    if (transferInFlight.current && result) return result;

    setChecking(true);
    const promise = (async (): Promise<CheckResult> => {
      try {
        const result: CheckResult = await updater.checkForUpdate();
        setCurrentVersion(result.currentVersion);
        setResult(result);
        if (result.status === "update") {
          if (notifiedVersionRef.current !== result.latest.versionName) {
            notifiedVersionRef.current = result.latest.versionName;
            toast.success(
              `New version ${result.latest.versionName} is available.`,
              { id: "update-available" }
            );
          }
        }
        return result;
      } catch {
        const failure: CheckResult = { status: "error", currentVersion: await updater.getCurrentVersion() };
        setCurrentVersion(failure.currentVersion);
        setResult(failure);
        return failure;
      }
    })();

    inflightRef.current = promise;
    try {
      return await promise;
    } finally {
      inflightRef.current = null;
      setChecking(false);
    }
  }, [result]);

  useEffect(() => {
    if (Platform.OS !== "android" || startupCheckStartedRef.current) return;
    const checkAtStartup = () => {
      if (startupCheckStartedRef.current) return;
      startupCheckStartedRef.current = true;
      void runCheck();
    };
    if (AppState.currentState === "active") {
      checkAtStartup();
      return;
    }
    // A background launch waits for its first foreground activation only.
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") {
        checkAtStartup();
        subscription.remove();
      }
    });
    return () => subscription.remove();
  }, [runCheck]);

  const downloadUpdate = useCallback(async () => {
    if (!latest || transferInFlight.current || inflightRef.current) return;
    transferInFlight.current = true;
    const version = latest.versionName;
    setTransfer({ version, status: "downloading", progress: null });
    try {
      const apk = await updater.downloadApk(latest, {
        onProgress: progress => setTransfer(current =>
          current?.version === version && current.status === "downloading"
            ? { ...current, progress }
            : current),
      });
      setTransfer({ version, status: "ready", apk });
      toast.success("Update downloaded. Install it from Settings.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTransfer({ version, status: "failed", message: message || "Download failed. Try again." });
      toast.error("Download failed. Try again.");
    } finally {
      transferInFlight.current = false;
    }
  }, [latest]);

  const installUpdate = useCallback(async () => {
    if (currentTransfer?.status !== "ready" || transferInFlight.current || inflightRef.current) return;
    const { apk, version } = currentTransfer;
    transferInFlight.current = true;
    setTransfer({ version, status: "installing" });
    try {
      await updater.installApk(apk);
      setTransfer({ version, status: "ready", apk });
    } catch {
      if (apk.exists) {
        setTransfer({ version, status: "ready", apk, installFailed: true });
        toast.error("Could not open the update installer.");
      } else {
        setTransfer({ version, status: "failed", message: "The APK is missing. Download the update again." });
      }
    } finally {
      transferInFlight.current = false;
    }
  }, [currentTransfer]);

  const value = useMemo(
    () => ({ hasUpdate, latest, currentVersion, checking, result, refresh: runCheck,
      transfer: currentTransfer, transferring, downloadUpdate, installUpdate }),
    [hasUpdate, latest, currentVersion, checking, result, runCheck, currentTransfer, transferring, downloadUpdate, installUpdate]
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be used within an UpdateProvider.");
  return ctx;
}
