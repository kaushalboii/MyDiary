"use client";

export const VAULT_ENVELOPE_KEY = "mydiary_vault_envelope_v1";
export const VAULT_SESSION_KEY = "mydiary_vault_session_v1";
export const VAULT_LOCKOUT_KEY = "mydiary_vault_lockout_v1";
export const AUTH_SESSION_KEY = "mydiary_auth_session_v1";
export const VAULT_STATE_EVENT = "mydiary:vault-state-changed";
export const AUTH_REQUIRED_EVENT = "mydiary:auth-required";

const PBKDF2_ITERATIONS = 310_000;
const STORAGE_CONFIG_KEY = "mydiary_storage_config_v1";
const SERVER_BOOKS_CACHE_KEY = "mydiary_server_books_cache_v9";
const OFFLINE_BOOK_ORDER_KEY = "mydiary_offline_book_order_v9";
const IDB_NAME = "mydiary_offline_fallback_v1";

export type VaultSecrets = {
  token: string;
  serverUrl?: string;
  label?: string;
};

type VaultEnvelope = {
  v: 1;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  autoLockMinutes: number;
  updatedAt: string;
};

type VaultSessionPayload = {
  secrets: VaultSecrets;
  unlockedAt: number;
  lastActivity: number;
};

type VaultLockoutState = {
  failedAttempts: number;
  lockedUntil: number;
};

export type VaultStatus = {
  enabled: boolean;
  unlocked: boolean;
  autoLockMinutes: number;
  updatedAt?: string;
  failedAttempts: number;
  lockoutRemainingMs: number;
};

function requireWebCrypto(): SubtleCrypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error(
      "Secure WebCrypto encryption requires HTTPS or localhost.",
    );
  }
  return window.crypto.subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readEnvelope(): VaultEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VAULT_ENVELOPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VaultEnvelope>;
    if (
      parsed.v !== 1 ||
      typeof parsed.salt !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.ciphertext !== "string"
    ) {
      return null;
    }
    return {
      v: 1,
      iterations: Number(parsed.iterations) || PBKDF2_ITERATIONS,
      salt: parsed.salt,
      iv: parsed.iv,
      ciphertext: parsed.ciphertext,
      autoLockMinutes: Math.max(1, Number(parsed.autoLockMinutes) || 15),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return null;
  }
}

function readLockout(): VaultLockoutState {
  if (typeof window === "undefined") return { failedAttempts: 0, lockedUntil: 0 };
  try {
    const raw = window.localStorage.getItem(VAULT_LOCKOUT_KEY);
    if (!raw) return { failedAttempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<VaultLockoutState>;
    return {
      failedAttempts: Math.max(0, Number(parsed.failedAttempts) || 0),
      lockedUntil: Math.max(0, Number(parsed.lockedUntil) || 0),
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: 0 };
  }
}

function writeLockout(state: VaultLockoutState) {
  if (typeof window === "undefined") return;
  try {
    if (state.failedAttempts === 0 && state.lockedUntil === 0) {
      window.localStorage.removeItem(VAULT_LOCKOUT_KEY);
    } else {
      window.localStorage.setItem(VAULT_LOCKOUT_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage quota issues
  }
}

function emitVaultStateChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VAULT_STATE_EVENT));
}

function writeSession(secrets: VaultSecrets) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const payload: VaultSessionPayload = {
    secrets: {
      token: secrets.token || "",
      serverUrl: secrets.serverUrl,
      label: secrets.label,
    },
    unlockedAt: now,
    lastActivity: now,
  };
  window.sessionStorage.setItem(VAULT_SESSION_KEY, JSON.stringify(payload));
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const subtle = requireWebCrypto();
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

export function scrubPlaintextConfigToken() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.token) {
      parsed.token = "";
      window.localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Ignore malformed config
  }
}

export function hasVaultEnvelope(): boolean {
  return Boolean(readEnvelope());
}

export function getVaultAutoLockMinutes(): number {
  return readEnvelope()?.autoLockMinutes ?? 15;
}

export function getUnlockedVaultSecrets(): VaultSecrets | null {
  if (typeof window === "undefined") return null;
  const envelope = readEnvelope();
  if (!envelope) return null;
  try {
    const raw = window.sessionStorage.getItem(VAULT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VaultSessionPayload>;
    if (!parsed?.secrets || typeof parsed.lastActivity !== "number") return null;
    const idleMs = Date.now() - parsed.lastActivity;
    if (idleMs > envelope.autoLockMinutes * 60_000) {
      window.sessionStorage.removeItem(VAULT_SESSION_KEY);
      return null;
    }
    return {
      token: typeof parsed.secrets.token === "string" ? parsed.secrets.token : "",
      serverUrl: typeof parsed.secrets.serverUrl === "string" ? parsed.secrets.serverUrl : undefined,
      label: typeof parsed.secrets.label === "string" ? parsed.secrets.label : undefined,
    };
  } catch {
    return null;
  }
}

export function isVaultUnlocked(): boolean {
  if (!hasVaultEnvelope()) return true;
  return Boolean(getUnlockedVaultSecrets());
}

export function getVaultStatus(): VaultStatus {
  const envelope = readEnvelope();
  const lockout = readLockout();
  const remaining = Math.max(0, lockout.lockedUntil - Date.now());
  return {
    enabled: Boolean(envelope),
    unlocked: !envelope || Boolean(getUnlockedVaultSecrets()),
    autoLockMinutes: envelope?.autoLockMinutes ?? 15,
    updatedAt: envelope?.updatedAt || undefined,
    failedAttempts: lockout.failedAttempts,
    lockoutRemainingMs: remaining,
  };
}

export function touchVaultActivity(): void {
  if (typeof window === "undefined") return;
  const envelope = readEnvelope();
  if (!envelope) return;
  try {
    const raw = window.sessionStorage.getItem(VAULT_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<VaultSessionPayload>;
    if (!parsed?.secrets || typeof parsed.lastActivity !== "number") return;
    const now = Date.now();
    if (now - parsed.lastActivity > envelope.autoLockMinutes * 60_000) {
      lockVaultNow();
      return;
    }
    parsed.lastActivity = now;
    window.sessionStorage.setItem(VAULT_SESSION_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore malformed session payload
  }
}

export function updateUnlockedVaultToken(nextToken: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(VAULT_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<VaultSessionPayload>;
    if (!parsed?.secrets) return;
    parsed.secrets.token = nextToken;
    parsed.lastActivity = Date.now();
    window.sessionStorage.setItem(VAULT_SESSION_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore session update issues
  }
}

export async function enableVaultLock(
  passphrase: string,
  secrets: VaultSecrets,
  autoLockMinutes = 15,
): Promise<void> {
  const cleanPass = passphrase.trim();
  if (cleanPass.length < 6) {
    throw new Error("Passphrase must be at least 6 characters.");
  }
  const subtle = requireWebCrypto();
  const salt = window.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = window.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveAesKey(cleanPass, salt, PBKDF2_ITERATIONS, ["encrypt"]);
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      token: secrets.token || "",
      serverUrl: secrets.serverUrl || "",
      label: secrets.label || "Private Archive",
    }),
  );
  const cipherBuffer = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const envelope: VaultEnvelope = {
    v: 1,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    autoLockMinutes: Math.max(1, Math.min(240, Math.round(autoLockMinutes))),
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(VAULT_ENVELOPE_KEY, JSON.stringify(envelope));
  scrubPlaintextConfigToken();
  writeLockout({ failedAttempts: 0, lockedUntil: 0 });
  writeSession(secrets);
  emitVaultStateChange();
  window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed"));
}

export async function unlockVaultWithPassphrase(passphrase: string): Promise<VaultSecrets> {
  const envelope = readEnvelope();
  if (!envelope) {
    throw new Error("Owner Vault Lock is not enabled on this browser.");
  }
  const lockout = readLockout();
  const now = Date.now();
  if (lockout.lockedUntil > now) {
    const secs = Math.max(1, Math.ceil((lockout.lockedUntil - now) / 1000));
    throw new Error(`Too many wrong passphrases. Try again in ${secs}s.`);
  }

  const subtle = requireWebCrypto();
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const key = await deriveAesKey(passphrase.trim(), salt, envelope.iterations, ["decrypt"]);
    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as Partial<VaultSecrets>;
    const secrets: VaultSecrets = {
      token: typeof parsed.token === "string" ? parsed.token : "",
      serverUrl: typeof parsed.serverUrl === "string" ? parsed.serverUrl : undefined,
      label: typeof parsed.label === "string" ? parsed.label : undefined,
    };

    writeLockout({ failedAttempts: 0, lockedUntil: 0 });
    writeSession(secrets);
    emitVaultStateChange();
    window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed"));
    return secrets;
  } catch {
    const nextAttempts = lockout.failedAttempts + 1;
    let lockedUntil = 0;
    if (nextAttempts >= 5) {
      const backoffSeconds = Math.min(15 * 60, 15 * 2 ** (nextAttempts - 5));
      lockedUntil = Date.now() + backoffSeconds * 1000;
    }
    writeLockout({ failedAttempts: nextAttempts, lockedUntil });
    if (lockedUntil > Date.now()) {
      const secs = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
      throw new Error(`Incorrect vault passphrase. Locked for ${secs}s.`);
    }
    throw new Error("Incorrect vault passphrase.");
  }
}

export async function disableVaultLock(currentPassphrase: string): Promise<VaultSecrets> {
  const secrets = await unlockVaultWithPassphrase(currentPassphrase);
  window.localStorage.removeItem(VAULT_ENVELOPE_KEY);
  window.sessionStorage.removeItem(VAULT_SESSION_KEY);
  writeLockout({ failedAttempts: 0, lockedUntil: 0 });
  try {
    const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      STORAGE_CONFIG_KEY,
      JSON.stringify({
        ...parsed,
        serverUrl: secrets.serverUrl || parsed.serverUrl || "",
        token: secrets.token || "",
        label: secrets.label || parsed.label || "Private Archive",
      }),
    );
  } catch {
    // Ignore config restore issues
  }
  emitVaultStateChange();
  window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed"));
  return secrets;
}

export function lockVaultNow(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(VAULT_SESSION_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.sessionStorage.removeItem(SERVER_BOOKS_CACHE_KEY);
  window.localStorage.removeItem(SERVER_BOOKS_CACHE_KEY);
  emitVaultStateChange();
  window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed"));
}

export async function wipeLocalDiaryData(): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(VAULT_ENVELOPE_KEY);
  window.sessionStorage.removeItem(VAULT_SESSION_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.sessionStorage.removeItem(SERVER_BOOKS_CACHE_KEY);
  window.localStorage.removeItem(VAULT_LOCKOUT_KEY);
  window.localStorage.removeItem(STORAGE_CONFIG_KEY);
  window.localStorage.removeItem(SERVER_BOOKS_CACHE_KEY);
  window.localStorage.removeItem(OFFLINE_BOOK_ORDER_KEY);

  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(IDB_NAME);
        const timer = setTimeout(resolve, 600);
        req.onsuccess = () => {
          clearTimeout(timer);
          resolve();
        };
        req.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
        req.onblocked = () => {
          clearTimeout(timer);
          resolve();
        };
      } catch {
        resolve();
      }
    });
  }

  emitVaultStateChange();
  window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed"));
}

// --- Zero-Knowledge Military-Grade AES-256-GCM Memory Encryption ---
let cachedUserKey: CryptoKey | null = null;
const E2EE_SALT_PREFIX = "mydiary-e2ee-salt-v1:";

export async function setActiveUserEncryptionKey(username: string, pass: string): Promise<CryptoKey | null> {
  if (typeof window === "undefined" || !username || !pass) return null;
  const subtle = requireWebCrypto();
  const cleanUser = username.toLowerCase().trim();
  const saltHash = await subtle.digest("SHA-256", new TextEncoder().encode(E2EE_SALT_PREFIX + cleanUser));
  const salt = new Uint8Array(saltHash).slice(0, 16);
  cachedUserKey = await deriveAesKey(pass, salt, PBKDF2_ITERATIONS, ["encrypt", "decrypt"]);
  return cachedUserKey;
}

export function getActiveUserEncryptionKey(): CryptoKey | null {
  return cachedUserKey;
}

export function clearActiveUserEncryptionKey(): void {
  cachedUserKey = null;
}

export async function encryptMemoryPayload(
  payload: { title: string; note: string; paragraphs: string[]; layoutBlocks?: unknown[] },
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const subtle = requireWebCrypto();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptMemoryPayload(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<{ title: string; note: string; paragraphs: string[]; layoutBlocks?: unknown[] } | null> {
  try {
    const subtle = requireWebCrypto();
    const cipherBytes = base64ToBytes(ciphertext);
    const ivBytes = base64ToBytes(iv);
    const decrypted = await subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, cipherBytes);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

