import { File, Paths } from "expo-file-system";
import { MAX_ATTACHMENT_BYTES, type NoteAttachment } from "./attachmentData";

const materialized = new WeakMap<NoteAttachment, File>();

export async function readAttachment(uri: string, name: string, mimeType: string): Promise<NoteAttachment> {
  const file = new File(uri);
  if (!file.exists || !file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error("Choose a file smaller than 5 MB.");
  const safeMime = /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ? mimeType : "application/octet-stream";
  const image = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"].includes(safeMime);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    name: (name || "Attachment").slice(0, 200), mimeType: safeMime,
    kind: image ? "image" : safeMime.startsWith("audio/") ? "audio" : "file",
    base64: await file.base64(),
  };
}

export function materializeAttachment(item: NoteAttachment): File {
  const cached = materialized.get(item);
  if (cached?.exists) return cached;
  // Never use an imported filename as a path.
  const extension = item.name.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] ?? "bin";
  // Imported notes may reuse the same attachment ID with different contents.
  const file = new File(Paths.cache, `note-media-${item.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.${extension}`);
  file.write(item.base64, { encoding: "base64" });
  materialized.set(item, file);
  return file;
}

/** Only call during startup, before any editor/player can hold a cached file. */
export function clearAttachmentCache(): void {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith("note-media-")) {
      try { entry.delete(); } catch { /* A locked cache file can be retried next launch. */ }
    }
  }
}
