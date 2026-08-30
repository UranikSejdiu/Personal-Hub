import AsyncStorage from "@react-native-async-storage/async-storage";

const SELECTED_ID_KEY = "dhikr_selected_id";

export async function getSelectedDhikrId(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(SELECTED_ID_KEY);
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

export async function setSelectedDhikrId(id: number | null): Promise<void> {
  try {
    if (id == null) {
      await AsyncStorage.removeItem(SELECTED_ID_KEY);
    } else {
      await AsyncStorage.setItem(SELECTED_ID_KEY, String(id));
    }
  } catch {
    /* ignore persistence failures */
  }
}
