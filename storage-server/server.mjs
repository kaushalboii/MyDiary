import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || "./data");
const LEGACY_UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const LEGACY_DB_FILE = path.join(DATA_DIR, "diary.json");
const USERS_DIR = path.join(DATA_DIR, "users");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");
const REVOKED_FILE = path.join(DATA_DIR, "revoked-sessions.json");
const DEFAULT_BOOKS_PATH = path.join(__dirname, "default-books.json");
const ALLOW_ACCESS_REQUESTS = process.env.ALLOW_ACCESS_REQUESTS === "true";

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(LEGACY_UPLOADS_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(USERS_DIR, { recursive: true, mode: 0o700 });

const IS_LOOPBACK_HOST =
  HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";

function resolveSecretFile(envName, filename, allowEmptyOnLoopback) {
  const configured = (process.env[envName] || "").trim();
  if (configured) return configured;
  if (allowEmptyOnLoopback && (IS_LOOPBACK_HOST || process.env.ALLOW_INSECURE_PUBLIC === "true")) {
    return "";
  }
  const secretPath = path.join(DATA_DIR, filename);
  if (fs.existsSync(secretPath)) {
    const saved = fs.readFileSync(secretPath, "utf8").trim();
    if (saved) return saved;
  }
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretPath, `${generated}\n`, { mode: 0o600 });
  return generated;
}

const TOKEN = resolveSecretFile("DIARY_STORAGE_TOKEN", ".storage-token", true);
const SESSION_SECRET = resolveSecretFile("DIARY_SESSION_SECRET", ".session-secret", false);
const MEDIA_SECRET_MATERIAL = SESSION_SECRET || TOKEN;
const MEDIA_SIGNING_KEY = MEDIA_SECRET_MATERIAL
  ? crypto.createHmac("sha256", "mydiary-media-ticket-v2").update(MEDIA_SECRET_MATERIAL).digest()
  : null;

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,96}$/;
const SAFE_USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
const LEGACY_SCOPE_ID = "__legacy__";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ALLOWED_IMAGE_MIMES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
]);

function writeJsonAtomic(filePath, data) {
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600, encoding: "utf8" });
  fs.renameSync(tmpFile, filePath);
}

function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") return false;
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];
  if (!salt || !expectedHex || !Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  try {
    const derived = crypto.scryptSync(password, salt, 64, { N, r, p });
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashInviteCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  return crypto.createHash("sha256").update(clean).digest("hex");
}

function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "MYD-";
  for (let i = 0; i < 8; i += 1) {
    if (i === 4) out += "-";
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function readUsersStore() {
  if (!fs.existsSync(USERS_FILE)) return { users: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeUsersStore(store) {
  writeJsonAtomic(USERS_FILE, { users: store.users });
}

function readInvitesStore() {
  if (!fs.existsSync(INVITES_FILE)) return { invites: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(INVITES_FILE, "utf8"));
    return { invites: Array.isArray(parsed.invites) ? parsed.invites : [] };
  } catch {
    return { invites: [] };
  }
}

function writeInvitesStore(store) {
  writeJsonAtomic(INVITES_FILE, { invites: store.invites });
}

function readRevokedSessions() {
  if (!fs.existsSync(REVOKED_FILE)) return { revoked: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(REVOKED_FILE, "utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    const active = Array.isArray(parsed.revoked)
      ? parsed.revoked.filter((item) => item && typeof item.jti === "string" && Number(item.exp) > nowSec)
      : [];
    return { revoked: active };
  } catch {
    return { revoked: [] };
  }
}

function revokeSessionJti(jti, exp) {
  if (!jti) return;
  const store = readRevokedSessions();
  if (!store.revoked.some((r) => r.jti === jti)) {
    store.revoked.push({ jti, exp: Number(exp) || Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
    writeJsonAtomic(REVOKED_FILE, store);
  }
}

function isSessionRevoked(jti) {
  if (!jti) return true;
  return readRevokedSessions().revoked.some((r) => r.jti === jti);
}

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email || null,
    avatarUrl: user.avatarUrl || null,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function signSessionToken(user) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    jti: crypto.randomUUID(),
    uid: user.id,
    username: user.username,
    role: user.role,
    iat: nowSec,
    exp: nowSec + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("hex");
  return `v1.${encoded}.${sig}`;
}

function verifySessionToken(tokenStr) {
  if (typeof tokenStr !== "string" || !tokenStr.startsWith("v1.")) return null;
  const parts = tokenStr.split(".");
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !/^[0-9a-f]{64}$/i.test(sig || "")) return null;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(encoded).digest("hex");
  if (!timingSafeEqualStr(sig.toLowerCase(), expectedSig.toLowerCase())) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload?.uid || !payload?.jti || !Number.isFinite(payload.exp) || payload.exp <= nowSec) {
      return null;
    }
    if (isSessionRevoked(payload.jti)) return null;
    const { users } = readUsersStore();
    const user = users.find((u) => u.id === payload.uid && u.status === "active");
    if (!user) return null;
    return { user, payload };
  } catch {
    return null;
  }
}

function getScopePaths(scopeId = LEGACY_SCOPE_ID) {
  if (!scopeId || scopeId === LEGACY_SCOPE_ID) {
    fs.mkdirSync(LEGACY_UPLOADS_DIR, { recursive: true, mode: 0o700 });
    return {
      scopeId: LEGACY_SCOPE_ID,
      dir: DATA_DIR,
      dbFile: LEGACY_DB_FILE,
      uploadsDir: LEGACY_UPLOADS_DIR,
      uploadPrefix: "/uploads",
    };
  }
  const safeId = String(scopeId);
  if (!SAFE_ID_RE.test(safeId)) {
    throw new Error("Invalid user storage scope");
  }
  const userDir = path.join(USERS_DIR, safeId);
  const uploadsDir = path.join(userDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
  return {
    scopeId: safeId,
    dir: userDir,
    dbFile: path.join(userDir, "diary.json"),
    uploadsDir,
    uploadPrefix: `/uploads/${safeId}`,
  };
}

function migrateLegacyDataToOwner(ownerId) {
  const { dbFile: ownerDbFile, uploadsDir: ownerUploadsDir } = getScopePaths(ownerId);
  const legacySourceFile = fs.existsSync(LEGACY_DB_FILE)
    ? LEGACY_DB_FILE
    : path.join(DATA_DIR, "diary.legacy.migrated.json");

  let existingOwnerHasMemories = false;
  if (fs.existsSync(ownerDbFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(ownerDbFile, "utf8"));
      existingOwnerHasMemories = Array.isArray(existing.memories) && existing.memories.length > 0;
    } catch {
      existingOwnerHasMemories = false;
    }
  }

  // Always copy any missing legacy upload files to the owner's upload folder so existing photos remain accessible
  if (fs.existsSync(LEGACY_UPLOADS_DIR)) {
    for (const file of fs.readdirSync(LEGACY_UPLOADS_DIR)) {
      const src = path.join(LEGACY_UPLOADS_DIR, file);
      const dst = path.join(ownerUploadsDir, file);
      if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    }
  }

  if (existingOwnerHasMemories || !fs.existsSync(legacySourceFile)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(legacySourceFile, "utf8"));
    const legacyMemories = Array.isArray(parsed.memories) ? parsed.memories : [];
    if (fs.existsSync(ownerDbFile) && legacyMemories.length === 0) return;

    const rewriteUploadUrl = (u) => {
      if (typeof u !== "string" || !u.startsWith("/uploads/")) return u;
      const cleanName = path.basename(u.split("?")[0]);
      return `/uploads/${ownerId}/${cleanName}`;
    };
    const books = (Array.isArray(parsed.books) ? parsed.books : []).map((b) => ({
      ...b,
      coverImage: b.coverImage ? rewriteUploadUrl(b.coverImage) : undefined,
    }));
    const memories = legacyMemories.map((m) => ({
      ...m,
      photos: Array.isArray(m.photos)
        ? m.photos.map((p) => {
            const url = rewriteUploadUrl(p.url);
            const filename =
              (typeof p.filename === "string" && p.filename.trim()
                ? path.basename(p.filename.trim())
                : "") ||
              (typeof url === "string" && url.includes("/uploads/")
                ? path.basename(url.split("?")[0])
                : "");
            return { ...p, url, filename };
          })
        : [],
    }));
    writeJsonAtomic(ownerDbFile, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      books: books.length > 0 ? books : loadDefaultBooks(),
      memories,
      updatedAt: new Date().toISOString(),
    });
    if (legacySourceFile === LEGACY_DB_FILE && fs.existsSync(LEGACY_DB_FILE)) {
      fs.renameSync(LEGACY_DB_FILE, path.join(DATA_DIR, "diary.legacy.migrated.json"));
    }
  } catch {
    // Fallback gracefully if legacy file could not be read
  }
}

function hasValidImageMagicBytes(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (read < 4) return false;
    // JPEG FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // PNG 89 50 4E 47 0D 0A 1A 0A
    if (
      read >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return true;
    }
    // GIF8
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
      return true;
    }
    // RIFF....WEBP
    if (
      read >= 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    ) {
      return true;
    }
    // ISO BMFF ftyp (AVIF / HEIF)
    if (read >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function parseUploadPath(raw) {
  const clean = String(raw || "").trim().split("?")[0];
  if (!clean.startsWith("/uploads/")) return null;
  const rel = clean.slice("/uploads/".length);
  const parts = rel.split("/").filter(Boolean);
  if (parts.length === 1 && SAFE_FILENAME_RE.test(parts[0])) {
    return { scopeId: LEGACY_SCOPE_ID, filename: parts[0], cleanPath: `/uploads/${parts[0]}` };
  }
  if (parts.length === 2 && SAFE_ID_RE.test(parts[0]) && SAFE_FILENAME_RE.test(parts[1])) {
    return {
      scopeId: parts[0],
      filename: parts[1],
      cleanPath: `/uploads/${parts[0]}/${parts[1]}`,
    };
  }
  return null;
}

function isSafeImageUrl(raw) {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/uploads/")) {
    return Boolean(parseUploadPath(trimmed));
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function stripMediaSignature(url, fallbackScopeId = LEGACY_SCOPE_ID) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/uploads/")) {
    const parsed = parseUploadPath(trimmed);
    if (!parsed) return "";
    if (fallbackScopeId !== LEGACY_SCOPE_ID && parsed.scopeId === LEGACY_SCOPE_ID) {
      return `/uploads/${fallbackScopeId}/${parsed.filename}`;
    }
    return parsed.cleanPath;
  }
  return trimmed;
}

function signMediaPath(url, scopeId = LEGACY_SCOPE_ID) {
  if (typeof url !== "string" || !url.startsWith("/uploads/") || !MEDIA_SIGNING_KEY) {
    return url;
  }
  const parsed = parseUploadPath(url);
  if (!parsed) return url;
  const effScope = parsed.scopeId !== LEGACY_SCOPE_ID ? parsed.scopeId : scopeId;
  const prefix = effScope && effScope !== LEGACY_SCOPE_ID ? `/uploads/${effScope}` : "/uploads";
  const ticketKey =
    effScope && effScope !== LEGACY_SCOPE_ID ? `${effScope}/${parsed.filename}` : parsed.filename;
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const sig = crypto
    .createHmac("sha256", MEDIA_SIGNING_KEY)
    .update(`${ticketKey}:${exp}`)
    .digest("hex");
  return `${prefix}/${parsed.filename}?exp=${exp}&sig=${sig}`;
}

function verifyMediaSignature(ticketKey, expRaw, sigRaw) {
  if (!MEDIA_SIGNING_KEY) return true;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  if (typeof sigRaw !== "string" || !/^[0-9a-f]{64}$/i.test(sigRaw)) return false;
  const expected = crypto
    .createHmac("sha256", MEDIA_SIGNING_KEY)
    .update(`${ticketKey}:${exp}`)
    .digest("hex");
  return timingSafeEqualStr(sigRaw.toLowerCase(), expected.toLowerCase());
}

function signBookMedia(book, scopeId = LEGACY_SCOPE_ID) {
  if (!MEDIA_SIGNING_KEY || !book?.coverImage) return book;
  return {
    ...book,
    coverImage: signMediaPath(book.coverImage, scopeId),
  };
}

function signMemoryMedia(memory, scopeId = LEGACY_SCOPE_ID) {
  if (!MEDIA_SIGNING_KEY || !memory) return memory;
  return {
    ...memory,
    photos: Array.isArray(memory.photos)
      ? memory.photos.map((p) => ({
          ...p,
          url: signMediaPath(p.url, scopeId),
        }))
      : [],
  };
}

function loadDefaultBooks() {
  return JSON.parse(fs.readFileSync(DEFAULT_BOOKS_PATH, "utf8"));
}

const CURRENT_SCHEMA_VERSION = 9;

const LEGACY_COVER_HEXES = new Set([
  // Early template seeds:
  "#8c3f3d", "#2c5a4b", "#b68036", "#233a5c", "#523a46", "#314c63",
  "#475e48", "#2d5168", "#1f2430", "#4d3556", "#8c5938", "#3a637c",
  "#6e404d", "#a6853c", "#4b695e", "#5b323d", "#335443", "#644459",
  "#263b5c", "#9e3d3a", "#c97458", "#c88d3a", "#265a7b",
  // dd8eeb5 / 2b50152 default shelf:
  "#6f2130", "#4d746d", "#e8ddc6", "#162c55", "#262421", "#d36e5d",
  "#626a49", "#76a9c5", "#25282a", "#4c3970", "#1d4fa8", "#bd5a34",
  "#d8bd8c", "#e6bc39", "#d7d8d4", "#e7e1d3", "#365943", "#9a8ab8",
  "#1c304b",
  // 199015c soft minimalism shelf:
  "#7f5256", "#7d9489", "#ebe3d4", "#536678", "#45403b", "#c68c7b",
  "#8f977f", "#a3bcc9", "#585a5c", "#837991", "#607793", "#dfd3bd",
  "#b98c86", "#e7dbb9", "#d4d0c7", "#eae3d5", "#657f70", "#a99db3",
  "#4b5d73",
  // 5037200 vibrant soft shelf:
  "#a63a3e", "#246b5b", "#d99326", "#26538d", "#c85a3b", "#db6f57",
  "#568049", "#237887", "#262b3d", "#6b4573", "#c97a2b", "#347ea3",
  "#b54865", "#e0a938", "#3f8f7b", "#6e2c40", "#2d5e43", "#7d4a6b",
  "#2f4b7c",
  // v5/v6 dark slots #7-#19:
  "#214d3a", "#0b1d26", "#161822", "#311847", "#eae4d7", "#0b4f54",
  "#1b1e26", "#c23b2b", "#dedcd6", "#11224e", "#0f2d24", "#5e1b3a",
  "#1e1b18",
  // v7 shelf:
  "#06070b", "#f3ece0", "#030407", "#07518a", "#6a8dd6", "#4a1824",
  "#e4ecdf", "#dce8f5", "#eae3f5", "#f6e5d8", "#f1ebe0", "#d8ecea",
  "#f5eccd", "#f5dfe4", "#e6e8ec", "#d6e6dd", "#dfe5f7", "#efe3d9",
  "#ece9e2",
  // v8 pale washed pastel draft replaced by v9 rich editorial bookcloth collection:
  "#efe8dc", "#dce6dc", "#dae5f2", "#e4dfed", "#f4e3d7", "#f3ebd1",
  "#e3ece4", "#d9e7ec", "#e8e2f0", "#f3e1e4", "#ece5d8", "#d6eae7",
  "#efe8d2", "#f5e2e6", "#e5e7eb", "#d8e7dd", "#dfe4f5", "#efe1d8",
  "#edeae3",
]);

function isLegacyDefaultShelf(books) {
  if (!Array.isArray(books)) return false;
  if (
    books.length === 19 &&
    books[0]?.id === "memories-2022" &&
    books[18]?.id === "milestones-and-ascents" &&
    books.every((book) => LEGACY_COVER_HEXES.has(String(book?.cover || "").toLowerCase()))
  ) {
    return true;
  }
  if (
    books.length === 4 &&
    books[0]?.id === "memories-2022" &&
    books[1]?.id === "pocket-notes" &&
    books[2]?.id === "memories-2025" &&
    books[3]?.id === "current-diary"
  ) {
    return true;
  }
  return false;
}

function readDb(scopeId = LEGACY_SCOPE_ID) {
  const { dbFile } = getScopePaths(scopeId);
  if (!fs.existsSync(dbFile)) {
    const initial = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      books: loadDefaultBooks(),
      memories: [],
      updatedAt: new Date().toISOString(),
    };
    writeDbSync(initial, scopeId);
    return initial;
  }
  const raw = fs.readFileSync(dbFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.memories)) {
    parsed.memories = [];
  }
  if (!Array.isArray(parsed.books) || parsed.books.length === 0) {
    parsed.books = loadDefaultBooks();
  }
  if ((parsed.schemaVersion ?? 1) < CURRENT_SCHEMA_VERSION) {
    const freshDefaults = loadDefaultBooks();
    if (parsed.memories.length === 0 && isLegacyDefaultShelf(parsed.books)) {
      parsed.books = freshDefaults;
    } else {
      const byId = new Map(freshDefaults.map((b) => [b.id, b]));
      parsed.books = parsed.books.map((book) => {
        const nextDefault = byId.get(book.id);
        if (nextDefault && LEGACY_COVER_HEXES.has(String(book.cover || "").toLowerCase())) {
          return {
            ...book,
            cover: nextDefault.cover,
            secondary: nextDefault.secondary,
            accent: nextDefault.accent,
            ink: nextDefault.ink,
            coverTemplate: nextDefault.coverTemplate,
            spineStyle: nextDefault.spineStyle,
            motif: nextDefault.motif,
          };
        }
        return book;
      });
    }
    parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
    writeDbSync(parsed, scopeId);
  }
  return parsed;
}

function writeDbSync(data, scopeId = LEGACY_SCOPE_ID) {
  const { dbFile } = getScopePaths(scopeId);
  const payload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    books: data.books,
    memories: data.memories,
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(dbFile, payload);
}

const scopeQueues = new Map();
function mutateDb(mutator, scopeId = LEGACY_SCOPE_ID) {
  const prev = scopeQueues.get(scopeId) || Promise.resolve();
  const task = prev.then(async () => {
    const db = readDb(scopeId);
    const result = await mutator(db);
    writeDbSync(db, scopeId);
    return result;
  });
  scopeQueues.set(scopeId, task.catch(() => undefined));
  return task;
}

function directorySizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      total += fs.statSync(path.join(dir, entry.name)).size;
    }
  }
  return total;
}

function enrichBooks(db, scopeId = LEGACY_SCOPE_ID) {
  const statsByBook = new Map();
  for (const memory of db.memories) {
    const prev = statsByBook.get(memory.bookId) || {
      memoryCount: 0,
      photoCount: 0,
      latestMemoryDate: null,
      latestMemoryTitle: null,
    };
    prev.memoryCount += 1;
    prev.photoCount += Array.isArray(memory.photos) ? memory.photos.length : 0;
    const candidateDate = memory.date || memory.createdAt;
    if (!prev.latestMemoryDate || candidateDate > prev.latestMemoryDate) {
      prev.latestMemoryDate = candidateDate;
      prev.latestMemoryTitle =
        (typeof memory.title === "string" && memory.title.trim()) ||
        (typeof memory.note === "string" && memory.note.trim()) ||
        (Array.isArray(memory.paragraphs) && memory.paragraphs[0]) ||
        (Array.isArray(memory.photos) && memory.photos.length > 0 ? "Photo Keepsake" : "Untitled Page");
    }
    statsByBook.set(memory.bookId, prev);
  }
  return db.books.map((book) =>
    signBookMedia(
      {
        ...book,
        ...(statsByBook.get(book.id) || {
          memoryCount: 0,
          photoCount: 0,
          latestMemoryDate: null,
          latestMemoryTitle: null,
        }),
      },
      scopeId,
    ),
  );
}

function normalizeParagraphs(input) {
  if (Array.isArray(input)) {
    return input.map((p) => String(p).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [];
}

function cleanupOrphanedUploads(db, scopeId = LEGACY_SCOPE_ID) {
  const { uploadsDir } = getScopePaths(scopeId);
  const referenced = new Set();
  for (const memory of db.memories) {
    for (const photo of memory.photos || []) {
      if (photo.filename) referenced.add(path.basename(photo.filename));
      if (typeof photo.url === "string" && photo.url.includes("/uploads/")) {
        const cleanName = path.basename(photo.url.split("?")[0]);
        if (cleanName) referenced.add(cleanName);
      }
    }
  }
  for (const book of db.books || []) {
    if (typeof book.coverImage === "string" && book.coverImage.includes("/uploads/")) {
      const cleanName = path.basename(book.coverImage.split("?")[0]);
      if (cleanName) referenced.add(cleanName);
    }
  }
  if (!fs.existsSync(uploadsDir)) return;
  for (const file of fs.readdirSync(uploadsDir)) {
    if (!referenced.has(file)) {
      try {
        fs.unlinkSync(path.join(uploadsDir, file));
      } catch {
        // Ignore cleanup failures for missing files.
      }
    }
  }
}

const COVER_TEMPLATES = new Set([
  "classic",
  "clean-minimal",
  "bordered-plaque",
  "split-band",
  "side-spine-band",
  "arch-frame",
  "top-header-band",
  "sun-disc",
  "horizon-rule",
  "double-inset",
  "oval-medallion",
  "corner-brackets",
  "window-pane",
  "quarter-block",
  "bookmark-ribbon",
  "diagonal-sash",
  "botanical-stem",
  "catalog-ticket",
  "stepped-plinth",
  "photo-card",
]);
const SPINE_STYLES = new Set([
  "classic",
  "banded",
  "minimal",
  "bordered",
  "top-cap",
  "bottom-foot",
  "center-pill",
  "twin-rings",
]);
const PAPER_STYLES = new Set(["cream", "lined", "margin-lined", "dotgrid", "grid", "framed"]);
const FONT_STYLES = new Set(["serif", "sans", "mono"]);
const PAGE_NUMBER_STYLES = new Set(["classic", "roman", "minimal", "hidden"]);
const PAGE_HEADER_STYLES = new Set(["minimal", "centered", "ruled", "botanical"]);
const LAYOUT_BLOCK_KINDS = new Set(["header", "note", "text", "photo"]);

function sanitizeOptionalHex(val) {
  if (val === "") return undefined;
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : null;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Number(num.toFixed(3))));
}

function makeBookId(title, existingBooks) {
  const base =
    String(title || "volume")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "volume";
  const taken = new Set(existingBooks.map((b) => b.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function applyBookPatch(current, patch, scopeId = LEGACY_SCOPE_ID) {
  const nextTitle =
    typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : current.title;
  const nextShort =
    typeof patch.shortTitle === "string" && patch.shortTitle.trim()
      ? patch.shortTitle.trim()
      : typeof patch.title === "string" && patch.title.trim() && current.shortTitle === current.title
        ? nextTitle
        : current.shortTitle;

  return {
    ...current,
    title: nextTitle,
    shortTitle: nextShort,
    subtitle: typeof patch.subtitle === "string" ? patch.subtitle.trim() : current.subtitle,
    yearLabel: typeof patch.yearLabel === "string" ? patch.yearLabel.trim() : current.yearLabel,
    coverImprint:
      typeof patch.coverImprint === "string" ? patch.coverImprint.trim() : current.coverImprint,
    coverFooter:
      typeof patch.coverFooter === "string" ? patch.coverFooter.trim() : current.coverFooter,
    spineMark: typeof patch.spineMark === "string" ? patch.spineMark.trim() : current.spineMark,
    welcomeNote:
      typeof patch.welcomeNote === "string" ? patch.welcomeNote.trim() : current.welcomeNote,
    description:
      typeof patch.description === "string" ? patch.description.trim() : current.description,
    quote: typeof patch.quote === "string" ? patch.quote.trim() : current.quote,
    quoteBy: typeof patch.quoteBy === "string" ? patch.quoteBy.trim() : current.quoteBy,
    format: typeof patch.format === "string" && patch.format.trim() ? patch.format.trim() : current.format,
    cover: typeof patch.cover === "string" && patch.cover ? patch.cover : current.cover,
    secondary:
      typeof patch.secondary === "string" && patch.secondary ? patch.secondary : current.secondary,
    accent: typeof patch.accent === "string" && patch.accent ? patch.accent : current.accent,
    ink: typeof patch.ink === "string" && patch.ink ? patch.ink : current.ink,
    motif: typeof patch.motif === "string" && patch.motif ? patch.motif : current.motif,
    coverTemplate:
      typeof patch.coverTemplate === "string" && COVER_TEMPLATES.has(patch.coverTemplate)
        ? patch.coverTemplate
        : current.coverTemplate,
    spineStyle:
      typeof patch.spineStyle === "string" && SPINE_STYLES.has(patch.spineStyle)
        ? patch.spineStyle
        : current.spineStyle,
    paperStyle:
      typeof patch.paperStyle === "string" && PAPER_STYLES.has(patch.paperStyle)
        ? patch.paperStyle
        : current.paperStyle,
    fontStyle:
      typeof patch.fontStyle === "string" && FONT_STYLES.has(patch.fontStyle)
        ? patch.fontStyle
        : current.fontStyle,
    pageTint:
      patch.pageTint === ""
        ? undefined
        : sanitizeOptionalHex(patch.pageTint) ?? current.pageTint,
    pageInk:
      patch.pageInk === ""
        ? undefined
        : sanitizeOptionalHex(patch.pageInk) ?? current.pageInk,
    pageAccent:
      patch.pageAccent === ""
        ? undefined
        : sanitizeOptionalHex(patch.pageAccent) ?? current.pageAccent,
    pageNumberStyle:
      typeof patch.pageNumberStyle === "string" && PAGE_NUMBER_STYLES.has(patch.pageNumberStyle)
        ? patch.pageNumberStyle
        : current.pageNumberStyle,
    pageHeaderStyle:
      typeof patch.pageHeaderStyle === "string" && PAGE_HEADER_STYLES.has(patch.pageHeaderStyle)
        ? patch.pageHeaderStyle
        : current.pageHeaderStyle,
    coverImage:
      patch.coverImage === "" || patch.coverImage === null
        ? undefined
        : typeof patch.coverImage === "string" && isSafeImageUrl(patch.coverImage)
          ? stripMediaSignature(patch.coverImage, scopeId)
          : current.coverImage,
    showCoverTextWithImage:
      typeof patch.showCoverTextWithImage === "boolean"
        ? patch.showCoverTextWithImage
        : current.showCoverTextWithImage,
    height:
      patch.height !== undefined
        ? clampNumber(patch.height, 1.5, 2.55, current.height)
        : current.height,
    thickness:
      patch.thickness !== undefined
        ? clampNumber(patch.thickness, 0.1, 0.55, current.thickness)
        : current.thickness,
    width:
      patch.width !== undefined
        ? clampNumber(patch.width, 1.0, 1.65, current.width ?? 1.3)
        : current.width,
    living: typeof patch.living === "boolean" ? patch.living : current.living,
    collaboratorEmail:
      typeof patch.collaboratorEmail === "string"
        ? patch.collaboratorEmail.trim().toLowerCase()
        : patch.collaboratorEmail === null
          ? null
          : current.collaboratorEmail ?? null,
    collaborators:
      Array.isArray(patch.collaborators)
        ? patch.collaborators
            .map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""))
            .filter(Boolean)
        : typeof patch.collaboratorEmail === "string" && patch.collaboratorEmail.trim()
          ? [patch.collaboratorEmail.trim().toLowerCase()]
          : patch.collaboratorEmail === null
            ? []
            : Array.isArray(current.collaborators)
              ? current.collaborators
              : [],
    isShared:
      typeof patch.isShared === "boolean"
        ? patch.isShared
        : (Array.isArray(patch.collaborators) && patch.collaborators.length > 0) ||
          (typeof patch.collaboratorEmail === "string" && Boolean(patch.collaboratorEmail.trim()))
          ? true
          : Boolean(current.isShared),
    ownerId:
      current.ownerId ||
      (typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : undefined),
    ownerEmail:
      current.ownerEmail ||
      (typeof patch.ownerEmail === "string" && patch.ownerEmail
        ? patch.ownerEmail.trim().toLowerCase()
        : undefined),
    inviteStatus:
      typeof patch.inviteStatus === "string" ? patch.inviteStatus : current.inviteStatus,
    acceptedBy:
      Array.isArray(patch.acceptedBy) ? patch.acceptedBy : current.acceptedBy,
    pendingRequests: Array.isArray(patch.pendingRequests)
      ? patch.pendingRequests
      : Array.isArray(current.pendingRequests)
        ? current.pendingRequests
        : [],
  };
}

const ALBUM_STYLES = new Set(["portrait", "polaroid", "grid", "borderless", "filmstrip"]);

function isBookCollaborator(book, userEmail, userId) {
  if (!book) return false;
  const cleanEmail = typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";
  const cleanId = typeof userId === "string" ? userId.trim() : "";

  // 1. Is user the owner?
  if (cleanId && book.ownerId && String(book.ownerId) === cleanId) return true;
  if (cleanEmail && book.ownerEmail && String(book.ownerEmail).toLowerCase() === cleanEmail) return true;

  // 2. Is user in collaborators array?
  if (cleanEmail && Array.isArray(book.collaborators)) {
    if (book.collaborators.some((c) => typeof c === "string" && c.trim().toLowerCase() === cleanEmail)) {
      return true;
    }
  }

  // 3. Is user in single collaboratorEmail?
  if (cleanEmail && typeof book.collaboratorEmail === "string") {
    if (book.collaboratorEmail.trim().toLowerCase() === cleanEmail) {
      return true;
    }
  }

  // 4. Has user been accepted/approved?
  if (cleanEmail && Array.isArray(book.acceptedBy)) {
    if (book.acceptedBy.some((c) => typeof c === "string" && c.trim().toLowerCase() === cleanEmail)) {
      return true;
    }
  }

  return false;
}

function findBookAnywhere(bookId) {
  if (!bookId) return null;
  // 1. Check legacy DB
  try {
    const legacyDb = readDb(LEGACY_SCOPE_ID);
    const legacyBook = legacyDb.books.find((b) => b.id === bookId);
    if (legacyBook) {
      return { scopeId: LEGACY_SCOPE_ID, book: legacyBook, isOwner: false };
    }
  } catch {}

  // 2. Check all user DBs
  const { users } = readUsersStore();
  for (const u of users) {
    try {
      const uDb = readDb(u.id);
      const match = uDb.books.find((b) => b.id === bookId);
      if (match) {
        return { scopeId: u.id, book: match, ownerUser: u };
      }
    } catch {}
  }
  return null;
}

function findBookScope(bookId, req) {
  if (!bookId) return null;
  const userScope = req.storageScope || LEGACY_SCOPE_ID;
  const userEmail = (req.authUser?.email || "").toLowerCase().trim();
  const userId = req.authUser?.id || userScope;

  // 1. Check user's own database
  try {
    const ownDb = readDb(userScope);
    const ownBook = ownDb.books.find((b) => b.id === bookId);
    if (ownBook) {
      return {
        scopeId: userScope,
        isOwner: true,
        book: ownBook,
        ownerUser: req.authUser || null,
      };
    }
  } catch {}

  // 2. Scan all scopes (including legacy and all user scopes) for shared books
  const allScopes = [LEGACY_SCOPE_ID];
  const { users } = readUsersStore();
  for (const u of users) {
    if (!allScopes.includes(u.id)) allScopes.push(u.id);
  }

  for (const s of allScopes) {
    if (s === userScope) continue;
    try {
      const otherDb = readDb(s);
      const match = otherDb.books.find((b) => b.id === bookId);
      if (match && isBookCollaborator(match, userEmail, userId)) {
        const ownerUser = users.find((u) => u.id === s) || null;
        return {
          scopeId: s,
          isOwner: false,
          book: match,
          ownerUser,
        };
      }
    } catch {}
  }

  return null;
}

function findMemoryScope(memoryId, req) {
  if (!memoryId) return null;
  const userScope = req.storageScope || LEGACY_SCOPE_ID;
  const userEmail = req.authUser?.email || "";
  const userId = req.authUser?.id || userScope;

  // 1. Check user's own DB
  try {
    const ownDb = readDb(userScope);
    const ownMem = ownDb.memories.find((m) => m.id === memoryId);
    if (ownMem) {
      return { scopeId: userScope, isOwner: true, memory: ownMem };
    }
  } catch {}

  // 2. Scan other users' DBs for memories in shared books where user is collaborator
  if (userEmail || userId) {
    const { users } = readUsersStore();
    for (const u of users) {
      if (u.id === userScope) continue;
      try {
        const otherDb = readDb(u.id);
        const mem = otherDb.memories.find((m) => m.id === memoryId);
        if (mem) {
          const book = otherDb.books.find((b) => b.id === mem.bookId);
          if (book && isBookCollaborator(book, userEmail, userId)) {
            return { scopeId: u.id, isOwner: false, memory: mem, book };
          }
        }
      } catch {}
    }
  }

  return null;
}

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});

function normalizeOrigin(o) {
  if (!o) return "";
  try {
    const u = new URL(o.startsWith("http") ? o : `https://${o}`);
    return u.origin;
  } catch {
    return o.trim().replace(/\/+$/, "");
  }
}

const allowedOriginsRaw = (process.env.ALLOWED_ORIGINS || "").trim();
const explicitAllowedOrigins = allowedOriginsRaw
  .split(",")
  .map((o) => normalizeOrigin(o))
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  const cleanOrigin = normalizeOrigin(origin);
  // Always permit GitHub Pages origins & local development
  if (cleanOrigin.endsWith(".github.io")) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)) return true;

  if (explicitAllowedOrigins.length > 0) {
    if (explicitAllowedOrigins.includes("*")) {
      return process.env.ALLOW_INSECURE_PUBLIC === "true";
    }
    return explicitAllowedOrigins.includes(cleanOrigin);
  }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Diary-Token"],
  }),
);

app.use(express.json({ limit: "15mb" }));

const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_LOCKOUT_MS = 15 * 60 * 1000;
const AUTH_MAX_FAILURES = 10;
const failedAuthByIp = new Map();

function extractRequestToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (bearer) return bearer;
  return String(req.headers["x-diary-token"] || "").trim();
}

function getClientIpKey(req, bucket = "") {
  const fwdRaw = String(req.headers["x-forwarded-for"] || "");
  const fwdParts = fwdRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip =
    (fwdParts.length > 0 ? fwdParts[0] : "") ||
    String(req.headers["cf-connecting-ip"] || "").trim() ||
    String(req.headers["x-real-ip"] || "").trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
  return bucket ? `${ip}::${bucket}` : ip;
}

function isLoopbackReq(req) {
  if (req.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.origin)) {
    return false;
  }
  const hasProxyHeaders = Boolean(
    req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.headers["forwarded"] ||
      req.headers["cf-connecting-ip"] ||
      req.headers["x-forwarded-host"] ||
      req.headers["x-forwarded-proto"],
  );
  if (hasProxyHeaders) return false;
  const addr = String(req.socket?.remoteAddress || "");
  const isLoopbackAddr = addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  if (!isLoopbackAddr) return false;
  const hostHeader = String(req.headers.host || "").split(":")[0].toLowerCase();
  return hostHeader === "127.0.0.1" || hostHeader === "localhost" || hostHeader === "[::1]";
}

function authenticateRequest(req) {
  const { users } = readUsersStore();
  const hasAccounts = users.length > 0;
  const candidate = extractRequestToken(req);

  if (candidate) {
    const verifiedSession = verifySessionToken(candidate);
    if (verifiedSession) {
      return {
        authorized: true,
        kind: "session",
        user: verifiedSession.user,
        sessionPayload: verifiedSession.payload,
        scopeId: verifiedSession.user.id,
        isOwner: verifiedSession.user.role === "owner",
      };
    }
    if (TOKEN && timingSafeEqualStr(candidate, TOKEN)) {
      const firstOwner = users.find((u) => u.role === "owner" && u.status === "active") || null;
      return {
        authorized: true,
        kind: "owner-token",
        user: firstOwner,
        sessionPayload: null,
        scopeId: firstOwner ? firstOwner.id : LEGACY_SCOPE_ID,
        isOwner: true,
      };
    }
    return { authorized: false, kind: "invalid-token", scopeId: LEGACY_SCOPE_ID, isOwner: false };
  }

  // Only allow open loopback when run purely on a local machine and never over public tunnels
  if (!TOKEN && !hasAccounts && isLoopbackReq(req) && process.env.ALLOW_INSECURE_PUBLIC === "true") {
    return {
      authorized: true,
      kind: "loopback-open",
      user: null,
      sessionPayload: null,
      scopeId: LEGACY_SCOPE_ID,
      isOwner: true,
    };
  }

  return { authorized: false, kind: "missing", scopeId: LEGACY_SCOPE_ID, isOwner: false };
}

function checkRateLimitBlocked(req, res, bucket = "") {
  const ipKey = getClientIpKey(req, bucket);
  const now = Date.now();
  const existing = failedAuthByIp.get(ipKey);
  if (existing && existing.blockedUntil > now) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.blockedUntil - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too many failed authentication attempts. Please try again later.",
    });
    return true;
  }
  return false;
}

function recordAuthFailure(ipKey) {
  const now = Date.now();
  if (failedAuthByIp.size > 500) {
    for (const [k, v] of failedAuthByIp.entries()) {
      if (now - v.firstFailAt > AUTH_WINDOW_MS && v.blockedUntil < now) {
        failedAuthByIp.delete(k);
      }
    }
  }
  const existing = failedAuthByIp.get(ipKey);
  if (!existing || now - existing.firstFailAt > AUTH_WINDOW_MS) {
    const entry = { count: 1, firstFailAt: now, blockedUntil: 0 };
    failedAuthByIp.set(ipKey, entry);
    return entry;
  }
  existing.count += 1;
  if (existing.count > AUTH_MAX_FAILURES) {
    existing.blockedUntil = now + AUTH_LOCKOUT_MS;
  }
  return existing;
}

function clearAuthFailures(req, bucket = "") {
  failedAuthByIp.delete(getClientIpKey(req, bucket));
}

function failAuthWithRateLimit(req, res, statusCode, message, bucket = "") {
  const now = Date.now();
  const afterFail = recordAuthFailure(getClientIpKey(req, bucket));
  if (afterFail.blockedUntil > now) {
    const retryAfterSec = Math.max(1, Math.ceil((afterFail.blockedUntil - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too many failed authentication attempts. Please try again later.",
    });
    return;
  }
  res.status(statusCode).json({ error: message });
}

function requireAuth(req, res, next) {
  if (checkRateLimitBlocked(req, res)) return;

  const auth = authenticateRequest(req);
  if (auth.authorized) {
    clearAuthFailures(req);
    req.auth = auth;
    req.authUser = auth.user;
    req.storageScope = auth.scopeId;
    return next();
  }

  return failAuthWithRateLimit(
    req,
    res,
    401,
    "Authentication required. Please sign in to access your diary.",
  );
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.auth?.isOwner) {
      return res.status(403).json({ error: "Owner permission required." });
    }
    return next();
  });
}

function serveScopedUpload(scopeId, rawName, req, res) {
  if ((scopeId !== LEGACY_SCOPE_ID && !SAFE_ID_RE.test(scopeId)) || !SAFE_FILENAME_RE.test(rawName)) {
    return res.status(400).json({ error: "Invalid media path." });
  }
  const { users } = readUsersStore();
  const requireProtection = Boolean(TOKEN) || users.length > 0;
  const ticketKey = scopeId === LEGACY_SCOPE_ID ? rawName : `${scopeId}/${rawName}`;

  if (requireProtection) {
    const auth = authenticateRequest(req);
    const authorizedByHeader =
      auth.authorized && (auth.kind === "owner-token" || auth.scopeId === scopeId);
    const authorizedBySig = verifyMediaSignature(ticketKey, req.query.exp, req.query.sig);
    if (!authorizedByHeader && !authorizedBySig) {
      return res.status(401).json({ error: "Unauthorized media access." });
    }
  }

  const { uploadsDir } = getScopePaths(scopeId);
  const resolved = path.resolve(uploadsDir, rawName);
  if (!resolved.startsWith(uploadsDir + path.sep)) {
    return res.status(400).json({ error: "Invalid media path." });
  }
  if (!fs.existsSync(resolved) && scopeId !== LEGACY_SCOPE_ID) {
    // Recover legacy upload for owner account if the filename exists in LEGACY_UPLOADS_DIR and is referenced in owner's DB
    const { users } = readUsersStore();
    const ownerUser = users.find((u) => u.id === scopeId && u.role === "owner");
    const legacyCandidate = path.resolve(LEGACY_UPLOADS_DIR, rawName);
    if (
      ownerUser &&
      legacyCandidate.startsWith(LEGACY_UPLOADS_DIR + path.sep) &&
      fs.existsSync(legacyCandidate)
    ) {
      try {
        const db = readDb(scopeId);
        const isReferenced =
          db.memories.some((m) =>
            (m.photos || []).some(
              (p) =>
                path.basename(String(p.filename || "")) === rawName ||
                path.basename(String(p.url || "").split("?")[0]) === rawName,
            ),
          ) ||
          db.books.some(
            (b) => b.coverImage && path.basename(String(b.coverImage).split("?")[0]) === rawName,
          );
        if (isReferenced) {
          fs.copyFileSync(legacyCandidate, resolved);
        }
      } catch {
        // Ignore recovery failure and return 404 below
      }
    }
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "Media file not found." });
  }

  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader(
    "Cache-Control",
    requireProtection ? "private, max-age=3600" : "public, max-age=31536000, immutable",
  );
  return res.sendFile(resolved);
}

app.get("/uploads/:userId/:filename", (req, res) => {
  serveScopedUpload(String(req.params.userId || ""), String(req.params.filename || ""), req, res);
});

app.get("/uploads/:filename", (req, res) => {
  serveScopedUpload(LEGACY_SCOPE_ID, String(req.params.filename || ""), req, res);
});

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    let targetScope = req.storageScope || LEGACY_SCOPE_ID;
    const requestedBookId = typeof req.query?.bookId === "string" ? req.query.bookId.trim() : "";
    if (requestedBookId) {
      const resolved = findBookScope(requestedBookId, req);
      if (resolved) {
        targetScope = resolved.scopeId;
        req.uploadScope = resolved.scopeId;
      }
    }
    const { uploadsDir } = getScopePaths(targetScope);
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const ext = ALLOWED_IMAGE_MIMES.get(mime) || ".jpg";
    const stamp = Date.now();
    const rand = crypto.randomBytes(6).toString("hex");
    cb(null, `${stamp}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 24,
  },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      cb(new Error("Only JPEG, PNG, WebP, GIF, or AVIF image files are allowed."));
      return;
    }
    cb(null, true);
  },
});

// --- Multi-User Auth & Owner Verification Routes ---

app.get("/api/auth/status", (req, res) => {
  const { users } = readUsersStore();
  const auth = authenticateRequest(req);
  const authenticated = auth.authorized && (auth.kind === "session" || auth.kind === "owner-token");
  res.json({
    ok: true,
    needsOwnerSetup: users.length === 0,
    accountRequired: users.length > 0 || Boolean(TOKEN),
    needsSetupToken: users.length === 0 && Boolean(TOKEN) && !isLoopbackReq(req),
    registrationMode: ALLOW_ACCESS_REQUESTS ? "invite-or-approval" : "invite-only",
    authenticated,
    user: auth.user ? toPublicUser(auth.user) : null,
  });
});

app.post("/api/auth/bootstrap-owner", (req, res) => {
  if (checkRateLimitBlocked(req, res)) return;
  const store = readUsersStore();
  if (store.users.length > 0) {
    return res.status(403).json({ error: "Owner account already exists. Please sign in." });
  }

  const body = req.body || {};
  const providedSetup =
    typeof body.setupToken === "string" && body.setupToken.trim()
      ? body.setupToken.trim()
      : extractRequestToken(req);

  if (!TOKEN && !isLoopbackReq(req) && process.env.ALLOW_INSECURE_PUBLIC !== "true") {
    return failAuthWithRateLimit(
      req,
      res,
      403,
      "Remote owner bootstrap requires DIARY_STORAGE_TOKEN or direct localhost access.",
    );
  }

  if (TOKEN && !isLoopbackReq(req) && !timingSafeEqualStr(providedSetup, TOKEN)) {
    return failAuthWithRateLimit(
      req,
      res,
      401,
      "Valid setup key is required to claim owner on a remote server.",
    );
  }

  const username = normalizeUsername(body.username);
  const displayName = String(body.displayName || username).trim().slice(0, 64);
  const password = typeof body.password === "string" ? body.password : "";

  if (!SAFE_USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: "Username must be 3–32 characters (lowercase letters, numbers, '.', '_', '-').",
    });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be 8–128 characters." });
  }

  const owner = {
    id: `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    username,
    displayName: displayName || username,
    passwordHash: hashPassword(password),
    role: "owner",
    status: "active",
    invitedBy: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  store.users.push(owner);
  writeUsersStore(store);
  migrateLegacyDataToOwner(owner.id);
  clearAuthFailures(req);

  const sessionToken = signSessionToken(owner);
  res.status(201).json({
    sessionToken,
    user: toPublicUser(owner),
  });
});

app.post("/api/auth/login", (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const rateBucket = `login:${username || "*"}`;
  if (checkRateLimitBlocked(req, res, rateBucket)) return;

  if (!username || !password || password.length > 128) {
    return res.status(400).json({ error: "Username and valid password are required." });
  }

  const store = readUsersStore();
  const user = store.users.find((u) => u.username === username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return failAuthWithRateLimit(req, res, 401, "Invalid username or password.", rateBucket);
  }

  if (user.status === "pending") {
    return res.status(403).json({
      error: "Account is awaiting verification by the archive owner.",
    });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "Account is currently suspended." });
  }

  user.lastLoginAt = new Date().toISOString();
  writeUsersStore(store);
  clearAuthFailures(req, rateBucket);

  const sessionToken = signSessionToken(user);
  res.json({
    sessionToken,
    user: toPublicUser(user),
  });
});

app.post("/api/auth/google", async (req, res) => {
  if (checkRateLimitBlocked(req, res, "google-auth")) return;

  const { credential } = req.body || {};
  if (typeof credential !== "string" || !credential.trim()) {
    return res.status(400).json({ error: "Missing Google identity credential token." });
  }

  let payload = null;
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential.trim())}`,
    );
    if (response.ok) {
      payload = await response.json();
    }
  } catch (err) {
    console.error("Google token verification network check error:", err);
  }

  // Fallback JWT claim decoder in case network call is restricted
  if (!payload || !payload.sub) {
    try {
      const parts = credential.split(".");
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        const nowSec = Math.floor(Date.now() / 1000);
        if (
          decoded &&
          decoded.sub &&
          decoded.iss &&
          (decoded.iss.includes("accounts.google.com") || decoded.iss === "https://accounts.google.com") &&
          Number(decoded.exp) + 300 > nowSec
        ) {
          payload = decoded;
        }
      }
    } catch {
      payload = null;
    }
  }

  if (!payload || !payload.sub || !payload.email) {
    return failAuthWithRateLimit(
      req,
      res,
      401,
      "Invalid or expired Google authentication token.",
      "google-auth",
    );
  }

  const googleSub = String(payload.sub).trim();
  const email = String(payload.email).trim().toLowerCase();
  const displayName = String(payload.name || payload.given_name || email.split("@")[0])
    .trim()
    .slice(0, 64);
  const avatarUrl = typeof payload.picture === "string" ? payload.picture : null;

  const store = readUsersStore();
  let user = store.users.find(
    (u) => (u.googleSub && u.googleSub === googleSub) || (u.email && u.email.toLowerCase() === email),
  );

  // Link existing single owner to Google if logging in with Google for the first time
  if (!user && store.users.length === 1 && store.users[0].role === "owner" && !store.users[0].googleSub) {
    user = store.users[0];
  }

  const nowIso = new Date().toISOString();

  if (!user) {
    let baseUsername = email.split("@")[0].replace(/[^a-z0-9_.-]/gi, "").toLowerCase() || "user";
    if (baseUsername.length < 3) baseUsername = `${baseUsername}user`;
    let candidateUsername = baseUsername.slice(0, 28);
    let counter = 1;
    while (store.users.some((u) => u.username === candidateUsername)) {
      candidateUsername = `${baseUsername.slice(0, 24)}${counter++}`;
    }

    const isFirstUser = store.users.length === 0;
    const role = isFirstUser ? "owner" : "member";

    user = {
      id: `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      username: candidateUsername,
      displayName: displayName || candidateUsername,
      email,
      googleSub,
      avatarUrl,
      passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")),
      role,
      status: "active",
      invitedBy: null,
      createdAt: nowIso,
      lastLoginAt: nowIso,
    };

    if (isFirstUser) {
      migrateLegacyDataToOwner(user.id);
    }

    store.users.push(user);
    writeUsersStore(store);
    readDb(user.id);
  } else {
    user.googleSub = googleSub;
    if (email && !user.email) user.email = email;
    if (avatarUrl) user.avatarUrl = avatarUrl;
    user.lastLoginAt = nowIso;
    writeUsersStore(store);
  }

  clearAuthFailures(req, "google-auth");
  const sessionToken = signSessionToken(user);

  res.json({
    sessionToken,
    user: toPublicUser(user),
    googleSub,
  });
});

app.post("/api/auth/register", (req, res) => {
  if (checkRateLimitBlocked(req, res, "register")) return;

  const store = readUsersStore();
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  const displayName = String(body.displayName || username).trim().slice(0, 64);
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!SAFE_USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: "Username must be 3–32 characters (lowercase letters, numbers, '.', '_', '-').",
    });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be 8–128 characters." });
  }
  if (store.users.some((u) => u.username === username)) {
    return res.status(409).json({ error: "That username is already registered." });
  }

  const isFirstUser = store.users.length === 0;
  const role = isFirstUser ? "owner" : "member";
  const nowIso = new Date().toISOString();

  if (inviteCode) {
    const inviteStore = readInvitesStore();
    const codeHash = hashInviteCode(inviteCode);
    const invite = inviteStore.invites.find(
      (inv) =>
        !inv.usedBy &&
        (!inv.expiresAt || inv.expiresAt > nowIso) &&
        timingSafeEqualStr(inv.codeHash, codeHash),
    );
    if (invite) {
      invite.usedBy = `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      invite.usedByUsername = username;
      invite.usedAt = nowIso;
      writeInvitesStore(inviteStore);
    }
  }

  const newUser = {
    id: `usr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    username,
    displayName: displayName || username,
    passwordHash: hashPassword(password),
    role,
    status: "active",
    invitedBy: null,
    createdAt: nowIso,
    lastLoginAt: nowIso,
  };

  if (isFirstUser) {
    migrateLegacyDataToOwner(newUser.id);
  }

  store.users.push(newUser);
  writeUsersStore(store);
  readDb(newUser.id);
  clearAuthFailures(req, "register");

  const sessionToken = signSessionToken(newUser);
  res.status(201).json({
    pendingVerification: false,
    sessionToken,
    user: toPublicUser(newUser),
  });
});

app.post("/api/auth/logout", (req, res) => {
  const auth = authenticateRequest(req);
  if (auth.kind === "session" && auth.sessionPayload?.jti) {
    revokeSessionJti(auth.sessionPayload.jti, auth.sessionPayload.exp);
  }
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: req.authUser ? toPublicUser(req.authUser) : null,
    isOwner: Boolean(req.auth?.isOwner),
  });
});

app.get("/api/admin/members", requireOwner, (_req, res) => {
  const { users } = readUsersStore();
  const { invites } = readInvitesStore();
  const nowIso = new Date().toISOString();

  const members = users.map((u) => {
    const db = readDb(u.id);
    return {
      ...toPublicUser(u),
      booksCount: db.books.length,
      memoriesCount: db.memories.length,
    };
  });

  const activeInvites = invites
    .filter((inv) => !inv.usedBy && (!inv.expiresAt || inv.expiresAt > nowIso))
    .map((inv) => ({
      id: inv.id,
      label: inv.label,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    }));

  res.json({ members, invites: activeInvites });
});

app.post("/api/admin/invites", requireOwner, (req, res) => {
  const label = String(req.body?.label || "Member Invite").trim().slice(0, 64) || "Member Invite";
  const expiresDays = Math.max(1, Math.min(30, Number(req.body?.expiresDays) || 7));
  const rawCode = makeInviteCode();
  const store = readInvitesStore();
  const invite = {
    id: crypto.randomUUID(),
    label,
    codeHash: hashInviteCode(rawCode),
    createdBy: req.authUser?.id || "owner-token",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresDays * 86_400_000).toISOString(),
    usedBy: null,
    usedAt: null,
  };
  store.invites.unshift(invite);
  writeInvitesStore(store);
  res.status(201).json({
    invite: {
      id: invite.id,
      label: invite.label,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      code: rawCode,
    },
  });
});

app.delete("/api/admin/invites/:id", requireOwner, (req, res) => {
  const inviteId = String(req.params.id || "");
  const store = readInvitesStore();
  const next = store.invites.filter((i) => i.id !== inviteId);
  writeInvitesStore({ invites: next });
  res.json({ ok: true });
});

app.post("/api/admin/members/:id/status", requireOwner, (req, res) => {
  const memberId = String(req.params.id || "");
  const nextStatus = String(req.body?.status || "");
  if (nextStatus !== "active" && nextStatus !== "suspended") {
    return res.status(400).json({ error: "Status must be 'active' or 'suspended'." });
  }
  const store = readUsersStore();
  const member = store.users.find((u) => u.id === memberId);
  if (!member) {
    return res.status(404).json({ error: "Member account not found." });
  }
  if (member.role === "owner" && nextStatus !== "active") {
    return res.status(400).json({ error: "Owner account cannot be suspended." });
  }
  member.status = nextStatus;
  writeUsersStore(store);
  if (nextStatus === "active") {
    readDb(member.id);
  }
  res.json({ member: toPublicUser(member) });
});

app.delete("/api/admin/members/:id", requireOwner, (req, res) => {
  const memberId = String(req.params.id || "");
  const store = readUsersStore();
  const member = store.users.find((u) => u.id === memberId);
  if (!member) {
    return res.status(404).json({ error: "Member account not found." });
  }
  if (member.role === "owner") {
    return res.status(400).json({ error: "Owner account cannot be deleted." });
  }
  store.users = store.users.filter((u) => u.id !== memberId);
  writeUsersStore(store);
  try {
    fs.rmSync(path.join(USERS_DIR, memberId), { recursive: true, force: true });
  } catch {
    // Ignore cleanup failures
  }
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  const { users } = readUsersStore();
  const auth = authenticateRequest(req);
  const authRequired = Boolean(TOKEN) || users.length > 0 || !isLoopbackReq(req);
  const authorized = auth.authorized && (users.length === 0 || auth.kind !== "loopback-open");

  res.json({
    ok: true,
    service: "mydiary-storage",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    authRequired,
    tokenAuthorized: authorized,
    needsOwnerSetup: users.length === 0,
    accountRequired: users.length > 0 || Boolean(TOKEN),
    user: auth.user ? toPublicUser(auth.user) : null,
  });
});

app.get("/api/books", requireAuth, (req, res) => {
  const userScope = req.storageScope || LEGACY_SCOPE_ID;
  const db = readDb(userScope);
  const ownBooks = enrichBooks(db, userScope).map((b) => {
    const hasCollab = Boolean(
      (Array.isArray(b.collaborators) && b.collaborators.length > 0) ||
      (typeof b.collaboratorEmail === "string" && b.collaboratorEmail.trim()) ||
      b.isShared,
    );
    return {
      ...b,
      isShared: hasCollab,
      ownerId: b.ownerId || req.authUser?.id || userScope,
      ownerEmail: b.ownerEmail || req.authUser?.email || null,
    };
  });

  const existingIds = new Set(ownBooks.map((b) => b.id));
  const sharedBooks = [];

  const userEmail = (req.authUser?.email || "").toLowerCase().trim();
  const userId = req.authUser?.id || userScope;

  const allScopes = [LEGACY_SCOPE_ID];
  const { users } = readUsersStore();
  for (const u of users) {
    if (!allScopes.includes(u.id)) allScopes.push(u.id);
  }

  for (const s of allScopes) {
    if (s === userScope) continue;
    try {
      const otherDb = readDb(s);
      const otherEnriched = enrichBooks(otherDb, s);
      for (const b of otherEnriched) {
        if (!existingIds.has(b.id) && isBookCollaborator(b, userEmail, userId)) {
          existingIds.add(b.id);
          const ownerUser = users.find((u) => u.id === s);
          sharedBooks.push({
            ...b,
            isShared: true,
            ownerId: b.ownerId || s,
            ownerEmail: b.ownerEmail || ownerUser?.email || ownerUser?.username || "Owner",
            sharedBy: ownerUser?.displayName || ownerUser?.email || b.ownerEmail || "Owner",
          });
        }
      }
    } catch {}
  }

  res.json({ books: [...ownBooks, ...sharedBooks] });
});

app.post("/api/books", requireAuth, async (req, res) => {
  const body = req.body || {};
  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  if (requestedId && !SAFE_ID_RE.test(requestedId)) {
    res.status(400).json({ error: "Invalid book ID format." });
    return;
  }
  if (body.coverImage && typeof body.coverImage === "string" && !isSafeImageUrl(body.coverImage)) {
    res.status(400).json({ error: "Unsupported cover image URL." });
    return;
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled Diary";
  const result = await mutateDb((db) => {
    const baseTemplate = {
      id: requestedId && !db.books.some((b) => b.id === requestedId)
        ? requestedId
        : makeBookId(title, db.books),
      title,
      shortTitle: title,
      subtitle: "",
      yearLabel: String(new Date().getFullYear()),
      coverImprint: "PERSONAL ARCHIVE",
      coverFooter: "",
      spineMark: String(db.books.length + 1),
      welcomeNote: "Welcome to your new diary pages. Turn the leaf or write whenever you are ready.",
      description: "",
      quote: "",
      quoteBy: "",
      format: "Soft Linen Hardcover",
      cover: "#EAE0CE",
      secondary: "#B86B4B",
      accent: "#8E4B32",
      ink: "#261E18",
      motif: "lattice",
      coverTemplate: "clean-minimal",
      spineStyle: "top-cap",
      paperStyle: "cream",
      fontStyle: "serif",
      height: 2.12,
      thickness: 0.24,
      width: 1.3,
      ownerId: req.authUser?.id || req.storageScope,
      ownerEmail: req.authUser?.email || null,
    };
    const nextBook = applyBookPatch(baseTemplate, body, req.storageScope);
    nextBook.ownerId = req.authUser?.id || req.storageScope;
    nextBook.ownerEmail = req.authUser?.email || null;

    const rawPos = Number(body.positionIndex);
    const insertAt = Number.isFinite(rawPos)
      ? Math.min(db.books.length, Math.max(0, Math.round(rawPos)))
      : db.books.length;
    db.books.splice(insertAt, 0, nextBook);
    const books = enrichBooks(db, req.storageScope);
    return {
      book: books.find((b) => b.id === nextBook.id),
      books,
    };
  }, req.storageScope);
  res.status(201).json(result);
});

app.put("/api/books/reorder", requireAuth, async (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
  if (!orderedIds || orderedIds.length === 0) {
    res.status(400).json({ error: "orderedIds array is required." });
    return;
  }
  const books = await mutateDb((db) => {
    const map = new Map(db.books.map((b) => [b.id, b]));
    const reordered = [];
    for (const id of orderedIds) {
      const found = map.get(String(id));
      if (found) {
        reordered.push(found);
        map.delete(String(id));
      }
    }
    for (const remaining of map.values()) {
      reordered.push(remaining);
    }
    db.books = reordered;
    return enrichBooks(db, req.storageScope);
  }, req.storageScope);
  res.json({ books });
});

app.put("/api/books/:id", requireAuth, async (req, res) => {
  const bookId = String(req.params.id || "");
  if (!SAFE_ID_RE.test(bookId)) {
    res.status(400).json({ error: "Invalid book ID format." });
    return;
  }
  const patch = req.body || {};
  if (patch.coverImage && typeof patch.coverImage === "string" && !isSafeImageUrl(patch.coverImage)) {
    res.status(400).json({ error: "Unsupported cover image URL." });
    return;
  }

  const resolved = findBookScope(bookId, req);
  if (!resolved) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }
  const targetScope = resolved.scopeId;

  const result = await mutateDb((db) => {
    const idx = db.books.findIndex((b) => b.id === bookId);
    if (idx === -1) return null;
    const current = db.books[idx];
    const next = applyBookPatch(current, patch, targetScope);
    db.books[idx] = next;

    if (typeof patch.positionIndex === "number" && Number.isFinite(patch.positionIndex)) {
      const targetIdx = Math.min(db.books.length - 1, Math.max(0, Math.round(patch.positionIndex)));
      if (targetIdx !== idx) {
        const [moved] = db.books.splice(idx, 1);
        db.books.splice(targetIdx, 0, moved);
      }
    }

    cleanupOrphanedUploads(db, targetScope);
    const books = enrichBooks(db, targetScope);
    return {
      book: books.find((b) => b.id === bookId),
      books,
    };
  }, targetScope);

  if (!result) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }
  res.json(result);
});

app.delete("/api/books/:id", requireAuth, async (req, res) => {
  const bookId = String(req.params.id || "");
  if (!SAFE_ID_RE.test(bookId)) {
    res.status(400).json({ error: "Invalid book ID format." });
    return;
  }

  const resolved = findBookScope(bookId, req);
  if (!resolved) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }

  // If user is collaborator (not owner): leave/disconnect from book
  if (!resolved.isOwner) {
    await mutateDb((db) => {
      const idx = db.books.findIndex((b) => b.id === bookId);
      if (idx !== -1) {
        const book = db.books[idx];
        const userEmail = (req.authUser?.email || "").toLowerCase();
        if (Array.isArray(book.collaborators)) {
          book.collaborators = book.collaborators.filter((c) => c.toLowerCase() !== userEmail);
        }
        if (book.collaboratorEmail && book.collaboratorEmail.toLowerCase() === userEmail) {
          book.collaboratorEmail = null;
        }
        if ((!book.collaborators || book.collaborators.length === 0) && !book.collaboratorEmail) {
          book.isShared = false;
        }
      }
    }, resolved.scopeId);

    const userDb = readDb(req.storageScope);
    res.json({ ok: true, books: enrichBooks(userDb, req.storageScope) });
    return;
  }

  // Owner deleting book
  const result = await mutateDb((db) => {
    if (db.books.length <= 1) {
      return { error: "Keep at least one book on the shelf." };
    }
    const idx = db.books.findIndex((b) => b.id === bookId);
    if (idx === -1) return null;
    db.books.splice(idx, 1);
    db.memories = db.memories.filter((m) => m.bookId !== bookId);
    cleanupOrphanedUploads(db, req.storageScope);
    return { ok: true, books: enrichBooks(db, req.storageScope) };
  }, req.storageScope);

  if (!result) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

const presenceByBook = new Map(); // bookId -> Map<viewerId, viewerInfo>

app.post("/api/books/:id/request-access", async (req, res) => {
  const bookId = String(req.params.id || "");
  const body = req.body || {};
  const auth = authenticateRequest(req);
  const userEmail = String(auth.user?.email || body.email || "").toLowerCase().trim();
  const userName = String(
    auth.user?.displayName || auth.user?.username || body.name || userEmail.split("@")[0] || "Co-Author",
  ).trim();

  if (!userEmail || !userEmail.includes("@")) {
    return res.status(400).json({ error: "A valid email address is required to request co-author access." });
  }

  let resolved = findBookAnywhere(bookId);

  if (!resolved && body.bookData && body.bookData.title) {
    const targetScope = auth.scopeId || LEGACY_SCOPE_ID;
    await mutateDb((db) => {
      const existing = db.books.find((b) => b.id === bookId);
      if (!existing) {
        db.books.push({
          ...body.bookData,
          id: bookId,
          isShared: true,
          ownerId: body.bookData.ownerId || targetScope,
          ownerEmail: body.bookData.ownerEmail || userEmail,
        });
      }
    }, targetScope);
    resolved = findBookAnywhere(bookId);
  }

  if (!resolved) {
    return res.status(404).json({ error: "Book volume not found." });
  }

  const book = resolved.book;
  const isOwner =
    (book.ownerId && auth.user && String(book.ownerId) === String(auth.user.id)) ||
    (book.ownerEmail && book.ownerEmail.toLowerCase().trim() === userEmail);

  if (isOwner) {
    return res.json({ ok: true, status: "owner", message: "You are the book owner." });
  }

  const isPreInvited =
    (book.collaboratorEmail && book.collaboratorEmail.toLowerCase().trim() === userEmail) ||
    (Array.isArray(book.collaborators) &&
      book.collaborators.some((c) => String(c).toLowerCase().trim() === userEmail));

  if (isPreInvited) {
    await mutateDb((db) => {
      const b = db.books.find((item) => item.id === bookId);
      if (b) {
        if (!Array.isArray(b.acceptedBy)) b.acceptedBy = [];
        if (!b.acceptedBy.includes(userEmail)) b.acceptedBy.push(userEmail);
        if (!Array.isArray(b.collaborators)) b.collaborators = [];
        if (!b.collaborators.includes(userEmail)) b.collaborators.push(userEmail);
        b.isShared = true;
        b.inviteStatus = "accepted";
        if (Array.isArray(b.pendingRequests)) {
          b.pendingRequests = b.pendingRequests.filter((r) => r.email?.toLowerCase() !== userEmail);
        }
      }
    }, resolved.scopeId);
    return res.json({ ok: true, status: "accepted", message: "Book accepted and placed on your shelf!" });
  }

  // Add to pendingRequests for owner manual approval in the diary!
  await mutateDb((db) => {
    const b = db.books.find((item) => item.id === bookId);
    if (b) {
      if (!Array.isArray(b.pendingRequests)) b.pendingRequests = [];
      const already = b.pendingRequests.some((r) => r.email?.toLowerCase() === userEmail);
      if (!already) {
        b.pendingRequests.push({
          userId: auth.user?.id || null,
          email: userEmail,
          name: userName,
          avatarUrl: auth.user?.avatarUrl || null,
          requestedAt: new Date().toISOString(),
        });
      }
      b.isShared = true;
    }
  }, resolved.scopeId);

  return res.json({
    ok: true,
    status: "pending_approval",
    message: "Request sent to book owner. Once accepted in their diary, this volume will appear on your shelf.",
  });
});

app.post("/api/books/:id/accept", requireAuth, async (req, res) => {
  const bookId = String(req.params.id || "");
  const body = req.body || {};
  const fromInviteLink = Boolean(body.fromInviteLink);
  const user = req.authUser || {};
  const userEmail = (user.email || "").toLowerCase().trim();
  const userName = user.displayName || user.username || userEmail.split("@")[0] || "Co-Author";

  let resolved = findBookAnywhere(bookId);

  // If not on server yet but client provided bookData, save it to user scope
  if (!resolved && body.bookData && body.bookData.title) {
    const targetScope = req.storageScope || LEGACY_SCOPE_ID;
    await mutateDb((db) => {
      const existing = db.books.find((b) => b.id === bookId);
      if (!existing) {
        db.books.push({
          ...body.bookData,
          id: bookId,
          isShared: true,
          ownerId: body.bookData.ownerId || targetScope,
          ownerEmail: body.bookData.ownerEmail || userEmail,
        });
      }
    }, targetScope);
    resolved = findBookAnywhere(bookId);
  }

  if (!resolved) {
    res.status(404).json({ error: "Book volume not found." });
    return;
  }

  const book = resolved.book;
  const isOwner =
    (book.ownerId && String(book.ownerId) === String(user.id)) ||
    (book.ownerEmail && book.ownerEmail.toLowerCase().trim() === userEmail) ||
    resolved.scopeId === req.storageScope;

  if (isOwner) {
    res.json({ ok: true, status: "owner", message: "You are the book owner." });
    return;
  }

  const isPreInvitedByEmail =
    (book.collaboratorEmail && book.collaboratorEmail.toLowerCase().trim() === userEmail) ||
    (Array.isArray(book.collaborators) &&
      book.collaborators.some((c) => String(c).toLowerCase().trim() === userEmail));

  // If user was explicitly invited by email by the owner, accept directly!
  if (isPreInvitedByEmail || !fromInviteLink) {
    await mutateDb((db) => {
      const b = db.books.find((item) => item.id === bookId);
      if (b) {
        if (!Array.isArray(b.acceptedBy)) b.acceptedBy = [];
        if (userEmail && !b.acceptedBy.includes(userEmail)) {
          b.acceptedBy.push(userEmail);
        }
        if (!Array.isArray(b.collaborators)) b.collaborators = [];
        if (userEmail && !b.collaborators.includes(userEmail)) {
          b.collaborators.push(userEmail);
        }
        b.isShared = true;
        b.inviteStatus = "accepted";
        if (Array.isArray(b.pendingRequests)) {
          b.pendingRequests = b.pendingRequests.filter((r) => r.email?.toLowerCase() !== userEmail);
        }
      }
    }, resolved.scopeId);

    res.json({
      ok: true,
      status: "accepted",
      message: "Book accepted and placed on your shelf!",
    });
    return;
  }

  // Otherwise, user joined via a shared link ("when only if i share the link i need to manually accept thats the book owner need to manually aceept the ones thats from the dairy then only the book need to be viible like that"):
  // Submit join request for owner's manual approval!
  await mutateDb((db) => {
    const b = db.books.find((item) => item.id === bookId);
    if (b) {
      if (!Array.isArray(b.pendingRequests)) b.pendingRequests = [];
      const already = b.pendingRequests.some(
        (r) => r.email?.toLowerCase() === userEmail || (r.userId && r.userId === user.id),
      );
      if (!already && userEmail) {
        b.pendingRequests.push({
          userId: user.id,
          email: userEmail,
          name: userName,
          avatarUrl: user.avatarUrl || null,
          requestedAt: new Date().toISOString(),
        });
      }
      b.isShared = true;
    }
  }, resolved.scopeId);

  res.json({
    ok: true,
    status: "pending_approval",
    message: "Request sent to book owner. Once accepted in their diary, this volume will appear on your shelf.",
  });
});

app.post("/api/books/:id/approve-request", requireAuth, async (req, res) => {
  const bookId = String(req.params.id || "");
  const { email, action } = req.body || {};
  if (!email || !action) {
    return res.status(400).json({ error: "Missing email or action ('approve' | 'decline')." });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const resolved = findBookAnywhere(bookId);
  if (!resolved) {
    return res.status(404).json({ error: "Book volume not found." });
  }

  const isOwner =
    resolved.book.ownerId === req.authUser.id ||
    resolved.book.ownerEmail?.toLowerCase() === req.authUser.email?.toLowerCase() ||
    resolved.scopeId === req.storageScope;
  if (!isOwner) {
    return res.status(403).json({ error: "Only the book owner can accept collaborator requests." });
  }

  await mutateDb((db) => {
    const b = db.books.find((item) => item.id === bookId);
    if (!b) return;
    if (!Array.isArray(b.pendingRequests)) b.pendingRequests = [];
    b.pendingRequests = b.pendingRequests.filter((r) => r.email?.toLowerCase() !== cleanEmail);
    if (action === "approve") {
      if (!Array.isArray(b.collaborators)) b.collaborators = [];
      if (!b.collaborators.includes(cleanEmail)) {
        b.collaborators.push(cleanEmail);
      }
      if (!Array.isArray(b.acceptedBy)) b.acceptedBy = [];
      if (!b.acceptedBy.includes(cleanEmail)) {
        b.acceptedBy.push(cleanEmail);
      }
      if (!b.collaboratorEmail) {
        b.collaboratorEmail = cleanEmail;
      }
      b.isShared = true;
    }
  }, resolved.scopeId);

  const userScope = req.storageScope || LEGACY_SCOPE_ID;
  const db = readDb(userScope);
  res.json({ ok: true, books: enrichBooks(db, userScope) });
});

app.post("/api/books/:id/presence", requireAuth, (req, res) => {
  const bookId = String(req.params.id || "");
  const user = req.authUser || {};
  const viewerId = user.id || req.storageScope;
  const viewerInfo = {
    id: viewerId,
    email: user.email || "guest",
    name: user.displayName || user.username || "Reader",
    avatarUrl: user.avatarUrl || null,
    lastSeen: Date.now(),
  };

  let bookViewers = presenceByBook.get(bookId);
  if (!bookViewers) {
    bookViewers = new Map();
    presenceByBook.set(bookId, bookViewers);
  }
  bookViewers.set(viewerId, viewerInfo);

  // Clean stale viewers (> 20 seconds)
  const now = Date.now();
  for (const [id, info] of bookViewers.entries()) {
    if (now - info.lastSeen > 20000) {
      bookViewers.delete(id);
    }
  }

  res.json({ viewers: Array.from(bookViewers.values()) });
});

app.get("/api/books/:id/presence", requireAuth, (req, res) => {
  const bookId = String(req.params.id || "");
  const bookViewers = presenceByBook.get(bookId);
  if (!bookViewers) {
    res.json({ viewers: [] });
    return;
  }
  const now = Date.now();
  for (const [id, info] of bookViewers.entries()) {
    if (now - info.lastSeen > 20000) {
      bookViewers.delete(id);
    }
  }
  res.json({ viewers: Array.from(bookViewers.values()) });
});

app.get("/api/memories", requireAuth, (req, res) => {
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId.trim() : "";
  const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  const mood = typeof req.query.mood === "string" ? req.query.mood.trim() : "";

  let memories = [];
  if (bookId) {
    const resolved = findBookScope(bookId, req);
    const targetScope = resolved ? resolved.scopeId : req.storageScope;
    const db = readDb(targetScope);
    memories = db.memories
      .filter((m) => m.bookId === bookId)
      .map((m) => signMemoryMedia(m, targetScope));
  } else {
    const ownDb = readDb(req.storageScope);
    memories = ownDb.memories.map((m) => signMemoryMedia(m, req.storageScope));

    const userEmail = req.authUser?.email || "";
    const userId = req.authUser?.id || req.storageScope;
    if (userEmail || userId) {
      const { users } = readUsersStore();
      for (const u of users) {
        if (u.id === req.storageScope) continue;
        try {
          const otherDb = readDb(u.id);
          const sharedBookIds = new Set(
            otherDb.books.filter((b) => isBookCollaborator(b, userEmail, userId)).map((b) => b.id),
          );
          if (sharedBookIds.size > 0) {
            const sharedMems = otherDb.memories
              .filter((m) => sharedBookIds.has(m.bookId))
              .map((m) => signMemoryMedia(m, u.id));
            memories.push(...sharedMems);
          }
        } catch {}
      }
    }
  }

  if (mood && mood !== "All") {
    memories = memories.filter((m) => m.mood === mood);
  }
  if (query) {
    memories = memories.filter((m) => {
      const haystack = [
        m.title,
        m.note,
        m.location,
        m.mood,
        ...(m.paragraphs || []),
        ...(m.photos || []).map((p) => p.caption || ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  memories.sort((a, b) => {
    const left = `${b.date || ""}|${b.createdAt || ""}`;
    const right = `${a.date || ""}|${a.createdAt || ""}`;
    return left.localeCompare(right);
  });

  res.json({ memories });
});

app.get("/api/memories/:id", requireAuth, (req, res) => {
  const memoryId = String(req.params.id || "");
  if (!SAFE_ID_RE.test(memoryId)) {
    res.status(400).json({ error: "Invalid memory ID format." });
    return;
  }
  const resolved = findMemoryScope(memoryId, req);
  if (!resolved) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  res.json({ memory: signMemoryMedia(resolved.memory, resolved.scopeId) });
});

app.post("/api/upload", requireAuth, upload.array("photos", 24), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    if (!hasValidImageMagicBytes(file.path)) {
      for (const cleanupFile of files) {
        try {
          if (fs.existsSync(cleanupFile.path)) fs.unlinkSync(cleanupFile.path);
        } catch {
          // Ignore cleanup errors
        }
      }
      res.status(400).json({ error: "Uploaded file failed image signature verification." });
      return;
    }
  }

  const scope = req.uploadScope || req.storageScope || LEGACY_SCOPE_ID;
  const { uploadPrefix } = getScopePaths(scope);
  const uploaded = files.map((file) => ({
    id: crypto.randomUUID(),
    filename: file.filename,
    url: signMediaPath(`${uploadPrefix}/${file.filename}`, scope),
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
    caption: "",
  }));
  res.status(201).json({ files: uploaded });
});

function sanitizeIncomingPhotos(rawPhotos, scopeId = LEGACY_SCOPE_ID) {
  if (!Array.isArray(rawPhotos)) return { error: null, photos: [] };
  const photos = [];
  for (const photo of rawPhotos) {
    const url = String(photo?.url || "");
    if (!url || !isSafeImageUrl(url)) {
      return { error: "Unsupported or unsafe photo URL." };
    }
    const cleanUrl = stripMediaSignature(url, scopeId);
    const rawFilename = String(photo?.filename || "");
    const cleanFilename = rawFilename
      ? path.basename(rawFilename)
      : cleanUrl.startsWith("/uploads/")
        ? path.basename(cleanUrl)
        : "";
    if (cleanFilename && !SAFE_FILENAME_RE.test(cleanFilename)) {
      return { error: "Invalid photo filename." };
    }
    photos.push({
      id: typeof photo?.id === "string" && SAFE_ID_RE.test(photo.id) ? photo.id : crypto.randomUUID(),
      url: cleanUrl,
      filename: cleanFilename,
      originalName: String(photo?.originalName || ""),
      caption: typeof photo?.caption === "string" ? photo.caption.trim() : "",
      size: typeof photo?.size === "number" ? photo.size : undefined,
      mimeType: typeof photo?.mimeType === "string" ? photo.mimeType : undefined,
    });
  }
  return { error: null, photos };
}

function saveVerifiedBase64Raster(dataUrl, scopeId = LEGACY_SCOPE_ID, prefix = "") {
  const match = String(dataUrl || "").match(
    /^data:image\/(png|jpeg|jpg|webp|gif|avif);base64,([a-zA-Z0-9+/=\r\n]+)$/i,
  );
  if (!match) return null;
  if (match[2].length > 22 * 1024 * 1024) return null;
  const decoded = Buffer.from(match[2], "base64");
  if (decoded.length === 0 || decoded.length > 16 * 1024 * 1024) return null;
  const { uploadsDir, uploadPrefix } = getScopePaths(scopeId);
  const rawExt = match[1].toLowerCase().replace("jpeg", "jpg");
  const filename = `${prefix}${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${rawExt}`;
  const dest = path.join(uploadsDir, filename);
  fs.writeFileSync(dest, decoded);
  if (!hasValidImageMagicBytes(dest)) {
    try {
      fs.unlinkSync(dest);
    } catch {
      // Ignore unlink errors
    }
    return null;
  }
  return { filename, url: `${uploadPrefix}/${filename}` };
}

function sanitizeLayoutBlocks(rawBlocks) {
  if (rawBlocks === undefined) return undefined;
  if (!Array.isArray(rawBlocks)) return [];
  const cleaned = [];
  const seen = new Set();
  for (const item of rawBlocks) {
    if (!item || typeof item !== "object") continue;
    const kind = typeof item.kind === "string" && LAYOUT_BLOCK_KINDS.has(item.kind) ? item.kind : null;
    if (!kind) continue;
    const photoId =
      kind === "photo" && typeof item.photoId === "string" && SAFE_ID_RE.test(item.photoId)
        ? item.photoId
        : undefined;
    if (kind === "photo" && !photoId) continue;
    const id = kind === "photo" ? `photo-${photoId}` : kind;
    if (seen.has(id)) continue;
    seen.add(id);
    const w = clampNumber(item.w, 20, 94, 44);
    const maxX = Math.max(2, 97 - w);
    const x = clampNumber(item.x, 2, maxX, 5);
    const y = clampNumber(item.y, 2, 82, 6);
    const z = Math.round(clampNumber(item.z, 1, 99, 1));
    const side = item.side === "right" ? "right" : "left";
    const rotation =
      item.rotation !== undefined && Number.isFinite(Number(item.rotation))
        ? clampNumber(item.rotation, -12, 12, 0)
        : undefined;
    cleaned.push({
      id,
      kind,
      ...(photoId ? { photoId } : {}),
      side,
      x,
      y,
      w,
      z,
      ...(rotation !== undefined ? { rotation } : {}),
    });
  }
  return cleaned;
}

app.post("/api/memories", requireAuth, async (req, res) => {
  const body = req.body || {};
  const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
  const requestedId = typeof body.id === "string" ? body.id.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const paragraphs = normalizeParagraphs(body.paragraphs);

  if (!bookId) {
    res.status(400).json({ error: "bookId is required." });
    return;
  }
  if (!SAFE_ID_RE.test(bookId) || (requestedId && !SAFE_ID_RE.test(requestedId))) {
    res.status(400).json({ error: "Invalid bookId or memory id format." });
    return;
  }

  const resolved = findBookScope(bookId, req);
  if (!resolved) {
    res.status(404).json({ error: "Target book volume not found or access denied." });
    return;
  }
  const targetScope = resolved.scopeId;

  const photoCheck = sanitizeIncomingPhotos(body.photos, targetScope);
  if (photoCheck.error) {
    res.status(400).json({ error: photoCheck.error });
    return;
  }

  if (!title && !note && paragraphs.length === 0 && photoCheck.photos.length === 0 && !body.ciphertext) {
    res.status(400).json({ error: "Add a photo, a keepsake note, a title, or words to save this memory." });
    return;
  }

  const layoutBlocks = sanitizeLayoutBlocks(body.layoutBlocks);

  const created = await mutateDb((db) => {
    if (!db.books.some((b) => b.id === bookId)) {
      return { error: "Selected book volume does not exist." };
    }
    const now = new Date().toISOString();
    const photos = photoCheck.photos;

    const memory = {
      id: requestedId || crypto.randomUUID(),
      bookId,
      title,
      date:
        typeof body.date === "string" && body.date.trim()
          ? body.date.trim()
          : now.slice(0, 10),
      location: typeof body.location === "string" ? body.location.trim() : "",
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : "Nostalgic",
      note,
      paragraphs,
      photos,
      coverPhotoId:
        typeof body.coverPhotoId === "string" && body.coverPhotoId
          ? body.coverPhotoId
          : photos[0]?.id || null,
      albumStyle:
        body.albumStyle === "portrait" ||
        body.albumStyle === "grid" ||
        body.albumStyle === "borderless" ||
        body.albumStyle === "filmstrip"
          ? body.albumStyle
          : "polaroid",
      ...(layoutBlocks && layoutBlocks.length > 0 ? { layoutBlocks } : {}),
      ...(body.encrypted ? {
        encrypted: true,
        ciphertext: String(body.ciphertext || ""),
        iv: String(body.iv || ""),
      } : {}),
      authorEmail: req.authUser?.email || null,
      authorName: req.authUser?.displayName || req.authUser?.username || null,
      createdAt: now,
      updatedAt: now,
    };

    db.memories.push(memory);
    cleanupOrphanedUploads(db, targetScope);
    return { memory };
  }, targetScope);

  if (created.error) {
    res.status(404).json({ error: created.error });
    return;
  }
  res.status(201).json({ memory: signMemoryMedia(created.memory, targetScope) });
});

app.put("/api/memories/:id", requireAuth, async (req, res) => {
  const memoryId = String(req.params.id || "");
  if (!SAFE_ID_RE.test(memoryId)) {
    res.status(400).json({ error: "Invalid memory ID format." });
    return;
  }
  const body = req.body || {};
  const nextBookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
  if (nextBookId && !SAFE_ID_RE.test(nextBookId)) {
    res.status(400).json({ error: "Invalid book ID format." });
    return;
  }

  const resolved = findMemoryScope(memoryId, req);
  if (!resolved) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  const targetScope = resolved.scopeId;

  let sanitizedPhotos = null;
  if (body.photos !== undefined) {
    const check = sanitizeIncomingPhotos(body.photos, targetScope);
    if (check.error) {
      res.status(400).json({ error: check.error });
      return;
    }
    sanitizedPhotos = check.photos;
  }

  const nextLayoutBlocks =
    body.layoutBlocks !== undefined ? sanitizeLayoutBlocks(body.layoutBlocks) : undefined;

  const result = await mutateDb((db) => {
    const idx = db.memories.findIndex((m) => m.id === memoryId);
    if (idx === -1) return null;
    const current = db.memories[idx];
    const photos = sanitizedPhotos ?? current.photos;
    const nextTitle = typeof body.title === "string" ? body.title.trim() : current.title;
    const nextNote = typeof body.note === "string" ? body.note.trim() : current.note;
    const nextParagraphs =
      body.paragraphs !== undefined ? normalizeParagraphs(body.paragraphs) : current.paragraphs;

    if (!nextTitle && !nextNote && nextParagraphs.length === 0 && photos.length === 0 && !body.ciphertext) {
      return { error: "Keep at least a photo, title, note, or paragraph in this memory." };
    }

    const updated = {
      ...current,
      bookId: nextBookId || current.bookId,
      title: nextTitle,
      date: typeof body.date === "string" && body.date.trim() ? body.date.trim() : current.date,
      location: typeof body.location === "string" ? body.location.trim() : current.location,
      mood: typeof body.mood === "string" && body.mood.trim() ? body.mood.trim() : current.mood,
      note: nextNote,
      paragraphs: nextParagraphs,
      photos,
      coverPhotoId:
        typeof body.coverPhotoId === "string"
          ? body.coverPhotoId
          : photos.some((p) => p.id === current.coverPhotoId)
            ? current.coverPhotoId
            : photos[0]?.id || null,
      albumStyle:
        body.albumStyle === "portrait" ||
        body.albumStyle === "polaroid" ||
        body.albumStyle === "grid" ||
        body.albumStyle === "borderless" ||
        body.albumStyle === "filmstrip"
          ? body.albumStyle
          : current.albumStyle,
      layoutBlocks:
        nextLayoutBlocks !== undefined
          ? nextLayoutBlocks.length > 0
            ? nextLayoutBlocks
            : undefined
          : current.layoutBlocks,
      ...(body.encrypted ? {
        encrypted: true,
        ciphertext: String(body.ciphertext || ""),
        iv: String(body.iv || ""),
      } : {}),
      updatedAt: new Date().toISOString(),
    };

    db.memories[idx] = updated;
    cleanupOrphanedUploads(db, targetScope);
    return { memory: updated };
  }, targetScope);

  if (!result) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ memory: signMemoryMedia(result.memory, targetScope) });
});

app.delete("/api/memories/:id", requireAuth, async (req, res) => {
  const memoryId = String(req.params.id || "");
  if (!SAFE_ID_RE.test(memoryId)) {
    res.status(400).json({ error: "Invalid memory ID format." });
    return;
  }
  const resolved = findMemoryScope(memoryId, req);
  if (!resolved) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  const targetScope = resolved.scopeId;

  const deleted = await mutateDb((db) => {
    const idx = db.memories.findIndex((m) => m.id === memoryId);
    if (idx === -1) return false;
    db.memories.splice(idx, 1);
    cleanupOrphanedUploads(db, targetScope);
    return true;
  }, targetScope);

  if (!deleted) {
    res.status(404).json({ error: "Memory not found." });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/sync", requireAuth, async (req, res) => {
  const { books = [], memories = [] } = req.body || {};
  const result = await mutateDb((db) => {
    let updatedBooks = 0;
    let addedMemories = 0;

    for (const incomingBook of Array.isArray(books) ? books : []) {
      const incomingId = typeof incomingBook?.id === "string" ? incomingBook.id.trim() : "";
      if (!incomingId || !SAFE_ID_RE.test(incomingId)) continue;

      let normalizedCoverImage = incomingBook.coverImage;
      if (typeof normalizedCoverImage === "string" && normalizedCoverImage.startsWith("data:")) {
        const saved = saveVerifiedBase64Raster(normalizedCoverImage, req.storageScope, "cover-");
        normalizedCoverImage = saved ? saved.url : undefined;
      } else if (typeof normalizedCoverImage === "string" && normalizedCoverImage) {
        normalizedCoverImage = isSafeImageUrl(normalizedCoverImage)
          ? stripMediaSignature(normalizedCoverImage, req.storageScope)
          : undefined;
      }

      const idx = db.books.findIndex((b) => b.id === incomingId);
      if (idx !== -1) {
        db.books[idx] = applyBookPatch(
          db.books[idx],
          { ...incomingBook, coverImage: normalizedCoverImage },
          req.storageScope,
        );
        updatedBooks += 1;
      } else {
        db.books.push(
          applyBookPatch(
            { ...incomingBook, id: incomingId },
            { coverImage: normalizedCoverImage },
            req.storageScope,
          ),
        );
        updatedBooks += 1;
      }
    }

    const existingIds = new Set(db.memories.map((m) => m.id));
    for (const incomingMemory of Array.isArray(memories) ? memories : []) {
      const memId = typeof incomingMemory?.id === "string" ? incomingMemory.id.trim() : "";
      const bookId = typeof incomingMemory?.bookId === "string" ? incomingMemory.bookId.trim() : "";
      if (!memId || !SAFE_ID_RE.test(memId) || !bookId || !SAFE_ID_RE.test(bookId) || existingIds.has(memId)) {
        continue;
      }

      const photos = [];
      for (const photo of incomingMemory.photos || []) {
        const rawUrl = String(photo?.url || "");
        if (rawUrl.startsWith("data:")) {
          const saved = saveVerifiedBase64Raster(rawUrl, req.storageScope);
          if (saved) {
            photos.push({
              ...photo,
              id: typeof photo?.id === "string" && SAFE_ID_RE.test(photo.id) ? photo.id : crypto.randomUUID(),
              filename: saved.filename,
              url: saved.url,
            });
          }
          continue;
        }
        if (isSafeImageUrl(rawUrl)) {
          photos.push({
            ...photo,
            id: typeof photo?.id === "string" && SAFE_ID_RE.test(photo.id) ? photo.id : crypto.randomUUID(),
            url: stripMediaSignature(rawUrl, req.storageScope),
            filename: photo?.filename ? path.basename(String(photo.filename)) : "",
          });
        }
      }

      const syncedBlocks = sanitizeLayoutBlocks(incomingMemory.layoutBlocks);
      const syncTitle =
        typeof incomingMemory.title === "string" ? incomingMemory.title.trim().slice(0, 240) : "";
      const syncNote =
        typeof incomingMemory.note === "string" ? incomingMemory.note.trim().slice(0, 2000) : "";
      const syncParagraphs = normalizeParagraphs(incomingMemory.paragraphs);
      if (!syncTitle && !syncNote && syncParagraphs.length === 0 && photos.length === 0) {
        continue;
      }
      const nowIso = new Date().toISOString();
      db.memories.push({
        id: memId,
        bookId,
        title: syncTitle,
        date:
          typeof incomingMemory.date === "string" && incomingMemory.date.trim()
            ? incomingMemory.date.trim().slice(0, 32)
            : nowIso.slice(0, 10),
        location:
          typeof incomingMemory.location === "string" ? incomingMemory.location.trim().slice(0, 160) : "",
        mood:
          typeof incomingMemory.mood === "string" && incomingMemory.mood.trim()
            ? incomingMemory.mood.trim().slice(0, 64)
            : "Nostalgic",
        note: syncNote,
        paragraphs: syncParagraphs,
        photos,
        coverPhotoId:
          typeof incomingMemory.coverPhotoId === "string" && SAFE_ID_RE.test(incomingMemory.coverPhotoId)
            ? incomingMemory.coverPhotoId
            : photos[0]?.id || null,
        albumStyle:
          incomingMemory.albumStyle === "portrait" ||
          incomingMemory.albumStyle === "grid" ||
          incomingMemory.albumStyle === "filmstrip"
            ? incomingMemory.albumStyle
            : "polaroid",
        ...(syncedBlocks && syncedBlocks.length > 0 ? { layoutBlocks: syncedBlocks } : {}),
        createdAt:
          typeof incomingMemory.createdAt === "string" && incomingMemory.createdAt
            ? incomingMemory.createdAt
            : nowIso,
        updatedAt: nowIso,
      });
      existingIds.add(memId);
      addedMemories += 1;
    }

    return { updatedBooks, addedMemories, totalMemories: db.memories.length };
  }, req.storageScope);

  res.json({ ok: true, ...result });
});

app.use((err, _req, res, _next) => {
  if (err) {
    res.status(400).json({ error: err.message || "Storage server request error" });
    return;
  }
  res.status(500).json({ error: "Unexpected storage server error" });
});

readDb(LEGACY_SCOPE_ID);
app.listen(PORT, HOST, () => {
  console.log(`[mydiary-storage] running on http://${HOST}:${PORT}`);
});
