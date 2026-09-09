import * as SecureStore from "expo-secure-store";

const TUTORIAL_KEY = "app_has_seen_tutorial";

export async function hasSeenTutorial(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(TUTORIAL_KEY);
  return val === "true";
}

export async function setTutorialSeen(seen: boolean): Promise<void> {
  await SecureStore.setItemAsync(TUTORIAL_KEY, seen ? "true" : "false");
}
