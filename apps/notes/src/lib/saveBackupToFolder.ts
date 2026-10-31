import { Directory } from "expo-file-system";

/** Save through Android's document provider, independently of share targets. */
export async function saveBackupToFolder(prefix: string, buildJson: () => Promise<string>): Promise<string | null> {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_PICKER_CANCELLED") return null;
    throw error;
  }

  const json = await buildJson();
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const file = directory.createFile(name, "application/json");
  try {
    await file.write(json);
    return file.uri;
  } catch (error) {
    // Remove only the new incomplete export. Keep the original write error.
    try { await file.delete(); } catch { /* The provider may also deny cleanup. */ }
    throw error;
  }
}
