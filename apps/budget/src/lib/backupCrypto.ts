import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64, utf8 } from "@scure/base";
import { getRandomBytesAsync } from "expo-crypto";

const FORMAT = "uranik-budget.encrypted-backup";
const ITERATIONS = 600_000;
const MAX_PLAINTEXT_BYTES = 50 * 1024 * 1024;
export const MAX_BACKUP_FILE_BYTES = 70 * 1024 * 1024;
const AAD = utf8.decode(`${FORMAT}:1:PBKDF2-SHA256:${ITERATIONS}:AES-256-GCM`);

interface ProtectedBackup {
  format: typeof FORMAT;
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: typeof ITERATIONS;
  cipher: "AES-256-GCM";
  salt: string;
  nonce: string;
  ciphertext: string;
}

export function isEncryptedBackup(json: string): boolean {
  if (json.length > MAX_BACKUP_FILE_BYTES) throw new Error("Backup exceeds 70 MB.");
  const value: unknown = JSON.parse(json);
  return !!value && typeof value === "object" && "format" in value && value.format === FORMAT;
}

function passwordBytes(password: string, creating: boolean): Uint8Array {
  if (!password || password.length > 1024 || (creating && password.length < 12)) {
    throw new Error(creating ? "Use a password of 12–1024 characters." : "Enter the backup password.");
  }
  return utf8.decode(password);
}

function decodeField(value: unknown, maxBytes: number, exactBytes?: number): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil(maxBytes / 3) * 4) throw new Error("Invalid encrypted backup.");
  const bytes = base64.decode(value);
  if (bytes.length > maxBytes || (exactBytes !== undefined && bytes.length !== exactBytes) || base64.encode(bytes) !== value) {
    throw new Error("Invalid encrypted backup.");
  }
  return bytes;
}

/** Fresh salt derives a new key per file; a native CSPRNG supplies salt and nonce. */
export async function encryptBackup(json: string, password: string): Promise<string> {
  if (json.length > MAX_PLAINTEXT_BYTES) throw new Error("Backup exceeds 50 MB.");
  const plaintext = utf8.decode(json);
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new Error("Backup exceeds 50 MB.");
  const pass = passwordBytes(password, true);
  let key: Uint8Array | undefined;
  try {
    const salt = await getRandomBytesAsync(32);
    const nonce = await getRandomBytesAsync(12);
    key = await pbkdf2Async(sha256, pass, salt, { c: ITERATIONS, dkLen: 32, asyncTick: 10 });
    const protectedBackup: ProtectedBackup = {
      format: FORMAT, version: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, cipher: "AES-256-GCM",
      salt: base64.encode(salt), nonce: base64.encode(nonce), ciphertext: base64.encode(gcm(key, nonce, AAD).encrypt(plaintext)),
    };
    return JSON.stringify(protectedBackup);
  } finally {
    pass.fill(0); key?.fill(0); plaintext.fill(0);
  }
}

/** Authenticate the entire file before exposing any records to the import flow. */
export async function decryptBackup(json: string, password: string): Promise<string> {
  if (!isEncryptedBackup(json)) throw new Error("Not an encrypted MoneyPlan backup.");
  const value = JSON.parse(json) as Partial<ProtectedBackup>;
  // Fixed, versioned parameters prevent a file from selecting an excessive KDF cost.
  if (value.version !== 1 || value.kdf !== "PBKDF2-SHA256" || value.iterations !== ITERATIONS || value.cipher !== "AES-256-GCM") {
    throw new Error("Unsupported encrypted backup.");
  }
  const salt = decodeField(value.salt, 32, 32);
  const nonce = decodeField(value.nonce, 12, 12);
  const ciphertext = decodeField(value.ciphertext, MAX_PLAINTEXT_BYTES + 16);
  if (ciphertext.length < 16) throw new Error("Invalid encrypted backup.");
  const pass = passwordBytes(password, false);
  let key: Uint8Array | undefined;
  let plaintext: Uint8Array | undefined;
  try {
    key = await pbkdf2Async(sha256, pass, salt, { c: ITERATIONS, dkLen: 32, asyncTick: 10 });
    plaintext = gcm(key, nonce, AAD).decrypt(ciphertext);
    return utf8.encode(plaintext);
  } catch {
    throw new Error("Wrong password or damaged backup.");
  } finally {
    pass.fill(0); key?.fill(0); plaintext?.fill(0);
  }
}
