import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner-native";
import * as updater from "./updater";
import type { UpdateInfo, CheckResult } from "./updater";
import { useI18n } from "./i18n";

interface UpdateContextValue {
  hasUpdate: boolean;
  latest: UpdateInfo | null;
  currentVersion: string;
  checking: boolean;
  refresh: () => Promise<CheckResult>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const tRef = useRef(t);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latest, setLatest] = useState<UpdateInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState("0.0.0");
  const [checking, setChecking] = useState(false);
  const didCheck = useRef(false);
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
        if (result.status === "update") {
          setLatest(result.latest);
          if (!hasUpdate) {
            toast.success(
              tRef.current("updateAvailableToast", { version: result.latest.versionName })
            );
          }
          setHasUpdate(true);
        } else {
          setLatest(null);
          setHasUpdate(false);
        }
        return result;
      } catch {
        setHasUpdate(false);
        setLatest(null);
        return { status: "error", currentVersion };
      }
    })();

    inflightRef.current = promise;
    try {
      return await promise;
    } finally {
      inflightRef.current = null;
      setChecking(false);
    }
  }, [currentVersion, hasUpdate]);

  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;
    void runCheck();
  }, [runCheck]);

  return (
    <UpdateContext.Provider
      value={{ hasUpdate, latest, currentVersion, checking, refresh: runCheck }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error("useUpdate must be used within an UpdateProvider.");
  return ctx;
}
