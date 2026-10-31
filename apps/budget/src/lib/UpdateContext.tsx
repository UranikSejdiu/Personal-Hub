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
import { toast } from "sonner-native";
import { AppState, Platform } from "react-native";
import * as updater from "./updater";
import type { UpdateInfo, CheckResult } from "./updater";
import { useI18n } from "./i18n";

interface UpdateContextValue {
  hasUpdate: boolean;
  latest: UpdateInfo | null;
  currentVersion: string;
  checking: boolean;
  result: CheckResult | null;
  refresh: () => Promise<CheckResult>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const tRef = useRef(t);
  const [result, setResult] = useState<CheckResult | null>(null);
  const latest = result?.status === "update" ? result.latest : result?.status === "error" ? result.cachedLatest ?? null : null;
  const hasUpdate = latest !== null;
  const [currentVersion, setCurrentVersion] = useState("0.0.0");
  const [checking, setChecking] = useState(false);
  const startupCheckStartedRef = useRef(false);
  const notifiedVersionRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<CheckResult> | null>(null);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const runCheck = useCallback(async (): Promise<CheckResult> => {
    if (inflightRef.current) return inflightRef.current;

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
              tRef.current("updateAvailableToast", { version: result.latest.versionName })
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
  }, []);

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

  const value = useMemo(
    () => ({ hasUpdate, latest, currentVersion, checking, result, refresh: runCheck }),
    [hasUpdate, latest, currentVersion, checking, result, runCheck]
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
