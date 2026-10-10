import AsyncStorage from "@react-native-async-storage/async-storage";

const SELECTED_ID_KEY = "dhikr_selected_id";
let selectedId: number | null | undefined;
let reading: Promise<number | null> | null = null;
let writes: Promise<void> = Promise.resolve();

export async function getSelectedDhikrId(): Promise<number | null> {
  if (selectedId !== undefined) return selectedId;
  if (!reading) {
    reading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(SELECTED_ID_KEY);
        const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
        // A choice made while storage is loading takes precedence.
        if (selectedId === undefined) selectedId = Number.isSafeInteger(id) ? id : null;
      } catch (error) {
        console.warn("[dhikr] failed to read selected item", error);
        if (selectedId === undefined) selectedId = null;
      }
      return selectedId;
    })();
  }
  try { return await reading; } finally { reading = null; }
}

export async function setSelectedDhikrId(id: number | null): Promise<void> {
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new RangeError("Invalid Dhikr selection.");
  // Keep navigation correct even when portable storage is unavailable.
  selectedId = id;
  writes = writes.then(async () => {
    try {
      if (id === null) await AsyncStorage.removeItem(SELECTED_ID_KEY);
      else await AsyncStorage.setItem(SELECTED_ID_KEY, String(id));
    } catch (error) {
      console.warn("[dhikr] failed to persist selected item", error);
    }
  });
  return writes;
}

export async function clearSelectedDhikrIdIfMissing(validIds: number[]): Promise<void> {
  try {
    const currentId = await getSelectedDhikrId();
    if (currentId != null && !validIds.includes(currentId)) {
      await setSelectedDhikrId(validIds.length > 0 ? validIds[0] : null);
    }
  } catch (error) {
    console.warn("[dhikr] failed to repair selected item", error);
  }
}
