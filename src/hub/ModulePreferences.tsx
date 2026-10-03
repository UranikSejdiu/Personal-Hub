import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { HUB_APPS } from "./registry";

const MODULES_KEY = "hub_enabled_modules";
const ALL_MODULE_IDS = HUB_APPS.map((app) => app.id);

interface ModulePreferencesValue {
  enabledIds: string[];
  ready: boolean;
  saveEnabledIds: (ids: string[]) => Promise<void>;
}

const ModulePreferencesContext = createContext<ModulePreferencesValue | null>(null);

function validModuleIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && ALL_MODULE_IDS.includes(id))) return null;
  const unique = ALL_MODULE_IDS.filter((id) => value.includes(id));
  return unique.length > 0 ? unique : null;
}

export function toggleEnabledModule(ids: string[], id: string): string[] {
  if (!ALL_MODULE_IDS.includes(id)) return ids;
  const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  return validModuleIds(next) ?? ids;
}

export function ModulePreferencesProvider({ children }: { children: ReactNode }) {
  const [enabledIds, setEnabledIds] = useState<string[]>(ALL_MODULE_IDS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MODULES_KEY)
      .then((raw) => {
        if (!active || raw === null) return;
        const parsed: unknown = JSON.parse(raw);
        const valid = validModuleIds(parsed);
        if (valid) setEnabledIds(valid);
      })
      .catch((error: unknown) => {
        console.warn("[hub] failed to load enabled modules", error);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => { active = false; };
  }, []);

  const saveEnabledIds = useCallback(async (ids: string[]) => {
    const valid = validModuleIds(ids);
    if (!valid) throw new Error("At least one valid module must remain enabled.");
    await AsyncStorage.setItem(MODULES_KEY, JSON.stringify(valid));
    setEnabledIds(valid);
  }, []);

  const value = useMemo(() => ({ enabledIds, ready, saveEnabledIds }), [enabledIds, ready, saveEnabledIds]);
  return <ModulePreferencesContext.Provider value={value}>{children}</ModulePreferencesContext.Provider>;
}

export function useModulePreferences(): ModulePreferencesValue {
  const context = useContext(ModulePreferencesContext);
  if (!context) throw new Error("useModulePreferences must be used within ModulePreferencesProvider.");
  return context;
}
