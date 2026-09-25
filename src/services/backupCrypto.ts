// Password encryption of backup files: AES-256-GCM, key derived from the password with
// PBKDF2-SHA-256 and a random salt. Without the password the file is unreadable; a wrong password
// (or a modified file) fails the GCM authentication check, so nothing half-decrypted is ever used.
import { b64 } from './security';

export const ENCRYPTED_FORMAT = 'jeybi-encrypted';
/** OWASP recommendation for PBKDF2-SHA-256 (2023). About 1 s on a mid-range phone, once per file. */
export const BACKUP_KDF_ITERATIONS = 600_000;
export const MIN_BACKUP_PASSWORD = 6;

export interface EncryptedBackup {
  app: 'jeybi';
  format: typeof ENCRYPTED_FORMAT;
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  /** Base64 of the encrypted backup JSON (the plain format-1/2 file). */
  data: string;
}

/** A derived key with the salt it came from (the auto backup keeps one so it never stores the password). */
export interface BackupKey {
  key: CryptoKey;
  salt: string;
  iterations: number;
}

const enc = new TextEncoder();
// Binds the header to the ciphertext: changing the format marker makes decryption fail.
const AAD = enc.encode('jeybi-backup-v1');

function random(n: number): Uint8Array<ArrayBuffer> {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export async function deriveBackupKey(password: string, saltB64?: string, iterations = BACKUP_KDF_ITERATIONS): Promise<BackupKey> {
  const salt = saltB64 ? b64.decode(saltB64) : random(16);
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // never extractable: it can be stored on the device, never read back as bytes
    ['encrypt', 'decrypt'],
  );
  return { key, salt: b64.encode(salt), iterations };
}

export async function encryptBackupText(plain: string, secret: string | BackupKey): Promise<string> {
  const k = typeof secret === 'string' ? await deriveBackupKey(secret) : secret;
  const iv = random(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, k.key, enc.encode(plain));
  const file: EncryptedBackup = {
    app: 'jeybi',
    format: ENCRYPTED_FORMAT,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: k.iterations, salt: k.salt },
    cipher: { name: 'AES-GCM', iv: b64.encode(iv) },
    data: b64.encode(cipher),
  };
  return JSON.stringify(file);
}

export function isEncryptedBackup(x: unknown): x is EncryptedBackup {
  const f = x as EncryptedBackup | null;
  return !!f && typeof f === 'object' && f.app === 'jeybi' && f.format === ENCRYPTED_FORMAT;
}

export class WrongPasswordError extends Error {
  constructor() { super('wrongPassword'); }
}

/** Throws WrongPasswordError for a wrong password or a damaged file (GCM cannot tell them apart). */
export async function decryptBackupText(file: EncryptedBackup, password: string): Promise<string> {
  if (file.v !== 1 || file.kdf?.name !== 'PBKDF2' || file.cipher?.name !== 'AES-GCM') throw new Error('unsupportedEncryption');
  const { key } = await deriveBackupKey(password, file.kdf.salt, file.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.decode(file.cipher.iv), additionalData: AAD }, key, b64.decode(file.data));
    return new TextDecoder().decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
