import { File } from "expo-file-system";
import { ResultCode, startActivityAsync } from "expo-intent-launcher";
import { Platform } from "react-native";

export async function saveBackupFile(
  prefix: string,
  buildJson: () => Promise<string>,
  share: () => Promise<unknown>
): Promise<string | null> {
  if (Platform.OS !== "android") {
    await share();
    return null;
  }

  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  let result;
  try {
    result = await startActivityAsync("android.intent.action.CREATE_DOCUMENT", {
      category: "android.intent.category.OPENABLE",
      type: "application/json",
      extra: { "android.intent.extra.TITLE": name },
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ActivityNotFoundException")) throw error;
    await share();
    return null;
  }

  if (result.resultCode === ResultCode.Canceled) return null;
  if (result.resultCode !== ResultCode.Success || !result.data?.startsWith("content://")) {
    throw new Error("Could not open the destination file.");
  }

  const file = new File(result.data);
  try {
    file.write(await buildJson());
    return file.uri;
  } catch (error) {
    try { file.delete(); } catch { /* Preserve the write error if the provider denies cleanup. */ }
    throw error;
  }
}
