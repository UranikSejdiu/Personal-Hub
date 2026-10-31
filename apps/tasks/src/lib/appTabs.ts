import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_TABS_KEY = "hub_last_tabs";

type AppTabMap = Record<string, string>;

// One in-memory copy is shared by every module, so a tab change is visible to
// the switcher immediately and writes are serialized behind a single queue
// instead of racing through read-modify-write cycles.
let cache: AppTabMap | null = null;
let loadPromise: Promise<AppTabMap> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function loadMap(): Promise<AppTabMap> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(APP_TABS_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        const map: AppTabMap = {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === "string") map[key] = value;
          }
        }
        cache = map;
        return map;
      } catch (error) {
        // Corrupt/unavailable storage must not break navigation; fall back to
        // no memory so each module opens on its default tab.
        console.warn("[hub] failed to read last tabs", error);
        cache = {};
        return cache;
      }
    })();
  }
  return loadPromise;
}

/** The tab a module was last on, or null when nothing is remembered yet. */
export async function getAppTab(appId: string): Promise<string | null> {
  const map = await loadMap();
  return map[appId] ?? null;
}

export async function setAppTab(appId: string, tabId: string): Promise<void> {
  const map = await loadMap();
  if (map[appId] === tabId) return;
  map[appId] = tabId;
  writeQueue = writeQueue.then(() =>
    AsyncStorage.setItem(APP_TABS_KEY, JSON.stringify(cache)).catch((error) => {
      // Non-critical: the in-memory value already drives this session.
      console.warn("[hub] failed to persist last tab", error);
    })
  );
  return writeQueue;
}
