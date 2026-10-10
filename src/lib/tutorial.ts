import { getPreference, setPreference } from "./preferences";

const TUTORIAL_KEY = "app_has_seen_tutorial";

export async function hasSeenTutorial(): Promise<boolean> {
  const val = await getPreference(TUTORIAL_KEY);
  return val === "true";
}

export async function setTutorialSeen(seen: boolean): Promise<void> {
  await setPreference(TUTORIAL_KEY, seen ? "true" : "false");
}
